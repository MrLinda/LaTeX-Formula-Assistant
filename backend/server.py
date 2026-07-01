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


@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> Response:
    """返回 index.html，并在 <head> 注入 local-api-base 供前端拿到本地端口。"""
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


# 前端资源目录 (bootstrap/, temml/)
@app.get("/{top}/{path:path}")
async def frontend_dir(top: str, path: str) -> Response:
    if top not in FRONTEND_DIRS:
        raise HTTPException(status_code=404)
    return _serve_frontend_file(f"{top}/{path}")


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
