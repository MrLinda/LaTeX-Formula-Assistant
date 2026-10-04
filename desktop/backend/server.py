"""FastAPI 应用：服务前端静态资源，并暴露本地推理/模型管理 API。

识别走 backend.inference，模型文件按需下载到用户数据目录。
"""

from __future__ import annotations

import base64
import json
import os
import re
import threading
import webbrowser
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from pydantic import BaseModel

from backend import inference
from backend.config import (
    APP_TITLE,
    FRONTEND_DIRS,
    FRONTEND_FILES,
    desktop_assets_dir,
    models_dir,
    state_file,
    web_root,
)


app = FastAPI(title=APP_TITLE, docs_url=None, redoc_url=None, openapi_url=None)


# ---------- 静态资源 ----------

def _guess_media_type(path: Path) -> str:
    ext = path.suffix.lower()
    return {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".ttf": "font/ttf",
        ".map": "application/json; charset=utf-8",
    }.get(ext, "application/octet-stream")


def _serve_frontend_file(rel_path: str) -> Response:
    """从 web_root() 下服务前端文件，做路径遍历防护。"""
    root = web_root()
    target = (root / rel_path).resolve()
    try:
        target.relative_to(root.resolve())
    except ValueError:
        raise HTTPException(status_code=404)
    if not target.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(target, media_type=_guess_media_type(target))


# 桌面版专属的外壳资源：注入到共用 index.html，使同一份前端
# 在桌面版呈现不同布局，而识别/渲染/历史等逻辑保持同源。
DESKTOP_HEAD_ANCHOR = "<!-- DESKTOP_HEAD -->"
DESKTOP_BODY_ANCHOR = "<!-- DESKTOP_BODY -->"


def _read_desktop_asset(name: str) -> str:
    """读取桌面版外壳资源；缺失时退回空串，保证应用仍能启动。"""
    path = desktop_assets_dir() / name
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8")


def _inject_desktop_shell(html: str) -> str:
    """把桌面版专属的样式/脚本/标记注入共用页面。

    注入点由 index.html 里两个注释锚点决定，锚点缺失时原样返回。
    """
    head = _read_desktop_asset("desktop.css")
    body = _read_desktop_asset("desktop.html")
    script = _read_desktop_asset("desktop.js")

    head_parts = []
    if head:
        head_parts.append(f"    <style>\n{head}\n    </style>")
    if script:
        head_parts.append(f"    <script>\n{script}\n    </script>")

    if DESKTOP_HEAD_ANCHOR in html and head_parts:
        html = html.replace(
            DESKTOP_HEAD_ANCHOR,
            "\n".join(head_parts),
            1,
        )
    if DESKTOP_BODY_ANCHOR in html and body:
        html = html.replace(DESKTOP_BODY_ANCHOR, body, 1)
    return html


@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> Response:
    """返回 index.html，注入本地端口与桌面版布局外壳。"""
    index_path = web_root() / "index.html"
    if not index_path.is_file():
        raise HTTPException(status_code=500, detail="index.html not found")

    html = index_path.read_text(encoding="utf-8")
    port = getattr(request.app.state, "local_port", None)
    base = f"http://127.0.0.1:{port}" if port else ""
    meta = f'<meta name="local-api-base" content="{base}">'

    # 幂等注入：如果已经存在同名 meta，先移除再插入
    html = re.sub(
        r'<meta\s+name="local-api-base"[^>]*>',
        "",
        html,
        flags=re.IGNORECASE,
    )
    # 持久化状态：桌面端 UI 状态存本地文件（data/ui-state.json），启动时
    # 注入 window.PERSISTED_STATE，前端存储适配层读内存、写入防抖 PUT 落盘。
    # </ 转义防止提前闭合 script 标签。
    state_js = json.dumps(_read_ui_state(), ensure_ascii=False).replace("</", "<\\/")
    boot = f"<script>window.PERSISTED_STATE = {state_js};</script>"
    html = html.replace("<head>", f"<head>\n    {meta}\n    {boot}", 1)

    # 注入桌面版布局（样式 + 外壳标记 + 外壳逻辑）
    html = _inject_desktop_shell(html)

    return HTMLResponse(content=html)


# ---------- UI 状态持久化（桌面端代替 localStorage） ----------

_ui_state_lock = threading.Lock()
_UI_STATE_MAX_BYTES = 1_000_000


def _read_ui_state() -> dict[str, Any]:
    try:
        data = json.loads(state_file().read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


class UiStatePayload(BaseModel):
    state: dict[str, Any]


@app.get("/api/state")
async def get_ui_state() -> JSONResponse:
    with _ui_state_lock:
        return JSONResponse({"state": _read_ui_state()})


@app.put("/api/state")
async def put_ui_state(payload: UiStatePayload) -> JSONResponse:
    """客户端全量回写 UI 状态（内存写完防抖落盘，last write wins）。"""
    raw = json.dumps(payload.state, ensure_ascii=False)
    if len(raw.encode("utf-8")) > _UI_STATE_MAX_BYTES:
        raise HTTPException(status_code=413, detail="状态数据超过 1MB 上限")
    with _ui_state_lock:
        path = state_file()
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(raw, encoding="utf-8")
        tmp.replace(path)
    return JSONResponse({"ok": True})


# 顶层前端脚本/样式
for _fname in FRONTEND_FILES:
    if _fname == "index.html":
        continue

    def _make_handler(name: str):
        async def _handler() -> Response:
            return _serve_frontend_file(name)
        return _handler

    app.add_api_route(f"/{_fname}", _make_handler(_fname), methods=["GET"])


# 前端资源目录 (bootstrap/, temml/) - 每个目录显式注册，避免吞 /api/*
def _register_dir(dir_name: str) -> None:
    async def _handler(path: str) -> Response:
        return _serve_frontend_file(f"{dir_name}/{path}")
    app.add_api_route(
        f"/{dir_name}/{{path:path}}", _handler, methods=["GET"]
    )


for _dir in FRONTEND_DIRS:
    _register_dir(_dir)


# ---------- 本地推理 / 模型管理 ----------

class RecognizeRequest(BaseModel):
    model: str
    image_base64: str


class ModelRequest(BaseModel):
    model: str


def _require_known_model(name: str) -> None:
    if not inference.is_known(name):
        raise HTTPException(status_code=404, detail=f"未知的本地模型：{name}")


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {"status": "ok"}


@app.get("/api/models")
async def list_models() -> JSONResponse:
    """列出本地模型及其下载状态。"""
    return JSONResponse(
        {
            "models": inference.list_models(),
            "directory": str(models_dir()),
            "totalBytes": inference.total_models_disk_usage(),
        }
    )


@app.post("/api/recognize")
def recognize(payload: RecognizeRequest) -> JSONResponse:
    """本地公式识别。

    模型文件缺失时返回 409 + error=model_not_downloaded，由前端触发下载。
    同步函数：FastAPI 会放到线程池执行，不阻塞事件循环。
    """
    _require_known_model(payload.model)

    if not inference.is_downloaded(payload.model):
        return JSONResponse(
            status_code=409,
            content={
                "error": "model_not_downloaded",
                "detail": f"模型「{payload.model}」尚未下载。",
                "sizeBytes": inference.model_size(payload.model),
            },
        )

    try:
        image = base64.b64decode(payload.image_base64)
    except ValueError:
        raise HTTPException(status_code=400, detail="图片 base64 解码失败")

    try:
        latex, elapsed = inference.recognize(payload.model, image)
    except FileNotFoundError:
        return JSONResponse(
            status_code=409,
            content={
                "error": "model_not_downloaded",
                "detail": f"模型「{payload.model}」尚未下载。",
                "sizeBytes": inference.model_size(payload.model),
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"本地识别失败：{exc}")

    return JSONResponse(
        {
            "latex": latex,
            "elapsed": round(elapsed, 3),
            # 本地推理不消耗云端 token，但保持与云端一致的响应结构
            "usage": {"total_tokens": 0},
        }
    )


@app.post("/api/models/download")
def download_model(payload: ModelRequest) -> JSONResponse:
    """下载模型文件。同步执行，首次约 171MB，进度由前端轮询查询。"""
    _require_known_model(payload.model)
    try:
        inference.download(payload.model)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"模型下载失败：{exc}")
    return JSONResponse({"ok": True, "model": payload.model})


@app.delete("/api/models/{model_name}")
def delete_model(model_name: str) -> JSONResponse:
    """删除本地模型文件；正在下载或推理时由推理层安全串行。"""
    _require_known_model(model_name)
    try:
        freed = inference.delete_model(model_name)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"模型删除失败：{exc}")
    return JSONResponse({"ok": True, "model": model_name, "freedBytes": freed})


@app.post("/api/models/open-directory")
def open_models_directory() -> JSONResponse:
    """在 Windows 文件资源管理器中打开 models/ 目录。"""
    path = models_dir()
    try:
        os.startfile(path)  # type: ignore[attr-defined]
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"无法打开模型目录：{exc}")
    return JSONResponse({"ok": True, "directory": str(path)})


class OpenExternalRequest(BaseModel):
    url: str


@app.post("/api/open-external")
def open_external(payload: OpenExternalRequest) -> JSONResponse:
    """用系统默认浏览器打开 http/https 链接（用户中心等外链）。

    pywebview 里 window.open 弹窗不可靠，前端经此接口交给系统浏览器。
    仅放行 http/https，防止 file:// 等方案被滥用。
    """
    if not re.match(r"^https?://", payload.url):
        raise HTTPException(status_code=400, detail="仅支持 http/https 链接")
    if not webbrowser.open(payload.url):
        raise HTTPException(status_code=500, detail="无法打开系统浏览器")
    return JSONResponse({"ok": True})


@app.get("/api/models/download/progress")
async def download_progress() -> JSONResponse:
    """当前下载进度：active / percent / downloaded / total / file。"""
    return JSONResponse(inference.get_progress())
