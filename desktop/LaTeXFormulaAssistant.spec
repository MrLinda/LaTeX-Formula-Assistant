# -*- mode: python ; coding: utf-8 -*-
r"""PyInstaller 打包配置（onedir 绿色版）。

构建（推荐用仓库根的 build.ps1，它会处理 venv 路径）：
    ..\..\\.venv\Scripts\python.exe -m PyInstaller --noconfirm LaTeXFormulaAssistant.spec
产物：
    dist/<APP_NAME>/<APP_NAME>.exe

几个关键决策：
- onedir 而非 onefile：onefile 每次启动都要把约 200MB 解压到临时目录，
  桌面应用启动会慢好几秒，得不偿失。
- 模型不打进包：模型按需下载到用户数据目录，包体积因此与模型解耦。
- 前端资源清单从 backend.config 派生：以后新增前端文件只要按既有约定登记，
  就不会出现「后端能路由、打包却漏了文件」的静默降级。
- 打包布局与仓库布局一致（<根>/web/ 与 <根>/desktop/），
  使 backend.config 的路径函数在开发与打包两种模式下无需分支。
- 控制台默认关闭（GUI 应用）；排查打包问题时设 LFA_DEBUG_CONSOLE=1 保留控制台。
"""

import os
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

# spec 位于 desktop/：ROOT = desktop/（backend 包与入口 main.py 所在）
ROOT = Path(SPECPATH).resolve()
REPO_ROOT = ROOT.parent
WEB_ROOT = REPO_ROOT / "web"
sys.path.insert(0, str(ROOT))

from backend.config import APP_NAME, FRONTEND_DIRS, FRONTEND_FILES  # noqa: E402

# 桌面版外壳资源：由后端注入到 index.html，不注册独立路由，
# 但同样必须随应用分发（名称对应 backend/server.py 的 _inject_desktop_shell）
DESKTOP_ASSETS = ("desktop.css", "desktop.html", "desktop.js")

# 有控制台才好排查启动期报错，所以做成开关而不是写死
DEBUG_CONSOLE = os.environ.get("LFA_DEBUG_CONSOLE") == "1"

datas = []
for _name in FRONTEND_FILES:
    datas.append((str(WEB_ROOT / _name), "web"))
for _name in DESKTOP_ASSETS:
    datas.append((str(ROOT / _name), "desktop"))
for _name in FRONTEND_DIRS:
    datas.append((str(WEB_ROOT / _name), f"web/{_name}"))

# rapid_latex_ocr 的 config.yaml 属于包数据，不显式收集会缺失
datas += collect_data_files("rapid_latex_ocr")

hiddenimports = [
    # pywebview 的平台后端是运行时按需载入的，静态分析看不到
    "webview.platforms.winforms",
    "webview.platforms.edgechromium",
    # 以 app 对象调用 uvicorn.run 时，它仍会动态挑选 loop / protocol 实现
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
]
# rapid_latex_ocr 在 backend/inference 里是延迟导入的，显式兜一手
hiddenimports += collect_submodules("rapid_latex_ocr")

# 明确排除体积大且用不到的库，避免被间接依赖拖进来
excludes = [
    "tkinter",
    "matplotlib",
    "PyQt5",
    "PyQt6",
    "PySide2",
    "PySide6",
    "IPython",
    "pytest",
]

a = Analysis(
    ["main.py"],
    pathex=[str(ROOT)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

# opencv 自带的 FFmpeg 视频编解码库有 26MB，而我们只用 cv2 的
# findNonZero / boundingRect / cvtColor 等图像函数，不碰任何视频 I/O。
EXCLUDE_BINARIES = ("opencv_videoio_ffmpeg",)
_before = len(a.binaries)
a.binaries = [b for b in a.binaries if not any(k in b[0] for k in EXCLUDE_BINARIES)]
print(
    "EXCLUDE: 剔除 %d 个二进制（FFmpeg 视频库）"
    % (_before - len(a.binaries))
)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name=APP_NAME,
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    # onnxruntime / opencv 的 DLL 经 UPX 压缩后容易出问题，关掉更稳
    upx=False,
    console=DEBUG_CONSOLE,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    # 仓库里暂无图标文件；有 .ico 后填 path 即可
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name=APP_NAME,
)
