"""应用入口：开发运行与 PyInstaller 打包共用。

单独放一个根目录入口脚本，是因为：
1. PyInstaller 需要一个脚本文件作为入口，不能直接指定 `-m backend.main`；
2. `python backend/main.py` 会把 sys.path[0] 设成 backend/ 目录，导致
   `from backend.xxx import` 找不到包，而本脚本位于根目录就不会有这个问题。

用法：
    python main.py          # 开发运行
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
