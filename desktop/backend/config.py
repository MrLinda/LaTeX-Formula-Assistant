"""全局配置常量：路径、端口、应用名等。

仓库布局（开发与打包保持一致）：
    <根>/web/       共享前端（网页版与桌面版共用，GitHub Pages 发布此目录）
    <根>/desktop/   桌面版外壳与后端

根目录在两种运行模式下通过 repo_root() 返回：
- 开发时：本文件所在目录向上三级（desktop/backend/config.py -> 仓库根）
- 打包时（PyInstaller onedir）：sys._MEIPASS 或 exe 所在目录，
  spec 会把 web/ 和 desktop/ 资源按同样的子目录结构打进包里
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

APP_NAME = "LaTeX-Formula-Assistant"
APP_TITLE = "LaTeX 公式助手"

# 前端资源位于 <根>/web/。这里登记的文件各注册一条顶层路由
# （index.html 由 index 路由特殊处理），路由路径保持 /script.js 等顶层形式，
# 使 index.html 内的相对引用在网页版与桌面版行为一致。
# desktop.css / desktop.js / desktop.html 不在此列：
# 它们在服务 index 时被内联注入，不作为独立请求落到后端。
FRONTEND_FILES = ("index.html", "config.js", "script.js", "styles.css")
FRONTEND_DIRS = ("bootstrap", "temml")


def repo_root() -> Path:
    """应用根目录（含 web/ 与 desktop/ 子目录）。

    - PyInstaller onedir（6.x）：资源在 exe 旁的 _internal/，sys._MEIPASS 指向它；
      旧版 onedir/onefile 语义不同，因此不硬编码，按「哪个候选目录下有 web/」判定。
    - 开发运行时：desktop/backend/config.py -> 仓库根。
    """
    if getattr(sys, "frozen", False):
        candidates = []
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            candidates.append(Path(meipass))
        candidates.append(Path(sys.executable).parent)
        for c in candidates:
            if (c / "web").is_dir():
                return c
        return candidates[0]
    # 开发环境：desktop/backend/config.py -> 仓库根
    return Path(__file__).resolve().parent.parent.parent


def web_root() -> Path:
    """共享前端目录（index.html、script.js 等，网页版与桌面版同源）。"""
    return repo_root() / "web"


def desktop_assets_dir() -> Path:
    """桌面版外壳资源目录（desktop.css/html/js，由后端注入共用页面）。"""
    return repo_root() / "desktop"


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
    return repo_root() / "models_manifest.json"
