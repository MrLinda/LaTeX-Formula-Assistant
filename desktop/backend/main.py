"""桌面应用入口：起 FastAPI 到 daemon 线程，主线程跑 PyWebView。"""

from __future__ import annotations

import socket
import sys
import threading

import uvicorn
import webview

from backend.config import APP_TITLE
from backend.server import app


def _pick_free_port() -> int:
    """让 OS 分配一个空闲端口。绑到 127.0.0.1，避免 Windows 防火墙弹窗。"""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]
    finally:
        s.close()


def _run_server(port: int) -> None:
    # log_config=None + access_log=False 避免打开一个隐藏控制台并刷日志。
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_config=None,
        access_log=False,
    )


def main() -> None:
    port = _pick_free_port()
    app.state.local_port = port

    server_thread = threading.Thread(
        target=_run_server,
        args=(port,),
        daemon=True,
        name="uvicorn",
    )
    server_thread.start()

    webview.create_window(
        APP_TITLE,
        f"http://127.0.0.1:{port}/",
        width=1280,
        height=900,
        min_size=(960, 640),
    )
    # private_mode=False 允许 Win+V 剪贴板历史等系统级功能
    webview.start(private_mode=False)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
