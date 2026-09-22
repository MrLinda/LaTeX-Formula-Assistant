"""应用入口：开发运行与 PyInstaller 打包共用。

入口放在 desktop/（backend 包的上一级）的原因：
1. PyInstaller 需要一个脚本文件作为入口，不能直接指定 `-m backend.main`；
2. `python desktop/backend/main.py` 会把 sys.path[0] 设成 backend/ 目录，导致
   `from backend.xxx import` 找不到包，而本脚本位于 desktop/ 就没有这个问题。

用法：
    python desktop/main.py    # 开发运行（仓库根目录下执行）
    直接双击构建产物中的 exe  # 打包后运行
"""

from __future__ import annotations

import sys

from backend.main import main

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
