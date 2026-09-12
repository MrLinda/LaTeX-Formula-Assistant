"""FastAPI 应用：服务前端静态资源，并暴露本地推理/模型管理 API。

Phase 1 仅实现前端静态资源服务和最小骨架路由；推理和模型管理留在后续 Phase。
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response

from backend.config import (
    APP_TITLE,
    FRONTEND_DIRS,
    FRONTEND_FILES,
    app_root,
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
    """从 app_root() 下服务前端文件，做路径遍历防护。"""
    root = app_root()
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
    path = app_root() / name
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
    root = app_root()
    index_path = root / "index.html"
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
    html = html.replace("<head>", f"<head>\n    {meta}", 1)

    # 注入桌面版布局（样式 + 外壳标记 + 外壳逻辑）
    html = _inject_desktop_shell(html)

    return HTMLResponse(content=html)


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


# ---------- 骨架 API（Phase 2/3 才有实际实现） ----------

@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {"status": "ok"}


@app.get("/api/models")
async def list_models() -> JSONResponse:
    """列出本地模型和下载状态。Phase 1 阶段返回空清单。"""
    return JSONResponse({"models": []})


@app.post("/api/recognize")
async def recognize() -> Response:
    """本地公式识别入口。Phase 1 阶段返回 501。"""
    raise HTTPException(status_code=501, detail="local inference not implemented yet")
