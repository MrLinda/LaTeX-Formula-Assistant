"""全局配置常量：路径、端口、应用名等。

打包与开发两种运行模式都通过这里的函数返回正确的路径：
- 开发时：项目根目录 = 本文件所在包的父目录
- 打包时（PyInstaller onedir）：项目根目录 = sys._MEIPASS 或 exe 所在目录
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

APP_NAME = "LaTeX-Formula-Assistant"
APP_TITLE = "LaTeX 公式助手"

# 前端资源相对应用根目录的位置。开发时和打包时布局保持一致，都在根目录。
# 这里登记的文件各注册一条顶层路由（index.html 由 index 路由特殊处理）。
# desktop.css / desktop.js / desktop.html 不在此列：
# 它们在服务 index 时被内联注入，不作为独立请求落到后端。
FRONTEND_FILES = ("index.html", "config.js", "script.js", "styles.css")
FRONTEND_DIRS = ("bootstrap", "temml")


def app_root() -> Path:
    """应用根目录（含 index.html 等前端资源）。

    - PyInstaller onedir 打包后：exe 所在目录（通过 sys.executable 定位）。
    - PyInstaller onefile 时：sys._MEIPASS（虽然默认走 onedir，兼容一手）。
    - 开发运行时：本模块所在包的父目录。
    """
    if getattr(sys, "frozen", False):
        # PyInstaller 环境
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass)
        return Path(sys.executable).parent
    # 开发环境：backend/config.py -> 项目根
    return Path(__file__).resolve().parent.parent


def user_data_dir() -> Path:
    """用户数据目录（模型存放位置等）。

    Windows: %APPDATA%\\LaTeX-Formula-Assistant
    其他系统: ~/.local/share/LaTeX-Formula-Assistant
    """
    if sys.platform == "win32":
        base = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        return Path(base) / APP_NAME
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / APP_NAME
    xdg = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    return Path(xdg) / APP_NAME


def models_dir() -> Path:
    """本地模型存放目录，首次访问时自动创建。"""
    d = user_data_dir() / "models"
    d.mkdir(parents=True, exist_ok=True)
    return d


def manifest_path() -> Path:
    """随应用打包的模型清单 JSON。"""
    return app_root() / "models_manifest.json"
