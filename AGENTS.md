# AGENTS.md — AI 协作须知（LaTeX-Formula-Assistant 客户端）

## 发版门槛（硬规则，最高优先级）

- **任何对外发布——commit+push master（触发 GitHub Pages 部署）、打 tag、发 GitHub Release——必须先请用户亲自本地测试确认，用户明确说"发"才能发。** AI 不要因为功能在本地跑通就自行发版；用户说"先别发版"时立即停手。
- 本地测试方式：仓库根 `.\.venv\Scripts\python.exe desktop\main.py` 起桌面版，或 `desktop` 目录下 `..\.venv\Scripts\python.exe -m uvicorn backend.server:app --port 8765` 用浏览器测（有 F12）。

## 环境与运行

- 依赖在**仓库根的 `.venv`**（不是全局 python）；build.ps1 也从这里取。直接 `python desktop/main.py` 会吃到全局环境，报依赖缺失。
- git push 走 Clash 代理：`git -c http.proxy=http://127.0.0.1:7897 push origin master`（直连 GitHub 常被重置）。

## 前端结构（web/ 与桌面共用一份）

- `web/` 是网页版（GitHub Pages 只发布这个目录）与桌面版共用的前端；桌面版只是 pywebview 窗口 + 本地 FastAPI + `desktop/desktop.html|css|js` 外壳注入（`html.desktop-mode` 类翻转样式、按 id 搬元素进骨架槽位）。**账号/设置弹窗两边是同一份 DOM，改一处两端生效**。
- 桌面版专属能力走本地后端 `/api/*`（如 `/api/models/open-directory`、`/api/open-external`），前端用 `window.LOCAL_API_BASE` / `isDesktopEnv()` 区分。
- `web/service.js` 是服务端 API 封装（纯 Bearer 令牌，走 `/api/v1/*` 公开路由；`/api/v1/account/*` 是 Cookie+CSRF 的用户中心专用面，客户端不要调）。

## 打包与版本

- 绿色版：`desktop\build.ps1` → `dist\LaTeX-Formula-Assistant.zip`；安装包：`desktop\build-installer.ps1`（Inno Setup，装在 `%LOCALAPPDATA%\Programs\Inno Setup 6`，**中文向导需要 `Languages\ChineseSimplified.isl`，默认不带，要从 jrsoftware/issrc 仓库的 `Files/Languages/` 下载**）。
- 版本号改三处：`desktop/pyproject.toml`、`desktop/backend/__init__.py`、`desktop/installer.iss`。**版本号必须先和用户确认，AI 不得自行决定**（用户会指定 patch/minor 的取舍）。
- GitHub Pages 的 JS 有 10 分钟缓存：改完前端自己测要 Ctrl+F5 强刷。
