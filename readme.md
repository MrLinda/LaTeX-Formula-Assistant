# LaTeX公式识别助手

## 简介
LaTeX公式识别助手是一个基于多模态大模型的工具，能够高效识别LaTeX公式并使用Temml进行公式渲染。通过简单的API密钥设置和图片上传，用户可以快速获取LaTeX代码并转换为MathML格式，方便在Word等文档中使用。

## 核心功能
- **公式识别**：支持通过图片上传或粘贴识别LaTeX公式。
- **实时预览**：在输入框中实时渲染公式效果。
- **多模型支持**：支持Qwen2.5-VL-32B-Instruct和Qwen2.5-VL-7B-Instruct等模型。
- **MathML转换**：一键将LaTeX公式转换为MathML格式，方便在Word中使用。
- **API密钥管理**：支持本地保存API密钥，方便下次使用。
- **模型配置独立化**：模型配置已独立到单独的config.js文件中，便于管理和扩展。
- **智能标签处理**：自动去除模型返回的多余标签（如$$、```latex```、\\(、\\)、<|begin_of_box|>、<|end_of_box|>等），确保纯净的LaTeX代码。

## 使用方法
### 安装
1. 下载项目的release包，解压到本地。
2. 或者直接访问 [GitHub Page](https://latex.luxiaoxiao.work/) 使用在线版本。

### 配置
1. 在页面左侧输入您的硅基流动API密钥，并点击“保存”。
2. API密钥将保存在本地存储中，下次打开页面无需重新输入。

### 使用
1. 在页面空白处按 `Ctrl+V` 粘贴公式图片，或者拖拽图片到上传区域。
2. 等待片刻，系统会自动识别公式并生成LaTeX代码。
3. 在右侧查看和编辑LaTeX代码，预览公式效果。
4. 点击“复制MathML”按钮，将公式转换为MathML格式并复制到剪贴板。

## 桌面版

网页版之外还提供桌面版：**PyWebView 窗口 + 本地 FastAPI 后端 + 与网页版共用的前端**。

仓库按用途分为两个目录：

| 目录 | 内容 |
| --- | --- |
| `web/` | 共享前端（网页版与桌面版同源），GitHub Pages 通过 Actions 只发布这个目录 |
| `desktop/` | 桌面版外壳（`desktop.css/html/js`）、FastAPI 后端与打包配置 |

布局由后端注入（`desktop.css/html/js`），识别、渲染、历史记录等逻辑与网页版同源，不存在两份需要同步的代码。

桌面版额外支持**本地公式识别**，无需 API 密钥、不联网、纯 CPU 推理。

### 运行（开发）

```powershell
python desktop/main.py
```

或先激活虚拟环境再运行（`.venv` 在仓库根目录）：

```powershell
.\.venv\Scripts\activate
python desktop/main.py
```

> 注意：不要用 `python desktop/backend/main.py`。脚本模式下 `sys.path[0]` 是 `desktop/backend/` 目录，
> 项目根不在搜索路径里，会报 `ModuleNotFoundError: No module named 'backend'`。

### 本地模型

| 项 | 说明 |
| --- | --- |
| 模型 | RapidLaTeXOCR（LaTeX-OCR 的 ONNX 版） |
| 推理 | onnxruntime CPU，无需显卡 |
| 体积 | 约 171MB，**首次使用时自动下载**，不打进安装包 |
| 位置 | `%APPDATA%\LaTeX-Formula-Assistant\models\rapid-latex-ocr\` |
| 速度 | 单张公式约 1–2 秒 |

下载过程会显示百分比进度。模型文件按 SHA256 校验；直连 GitHub 不可用时会自动回退到镜像源。

### 构建（Windows）

```powershell
.\desktop\build.ps1
```

产物在 `desktop\dist\` 下：

- `LaTeX-Formula-Assistant\` —— onedir 绿色版，双击里面的 exe 即可运行
- `LaTeX-Formula-Assistant.zip` —— 可直接分发的压缩包

构建前需安装 PyInstaller：`uv pip install --python ".venv\Scripts\python.exe" pyinstaller`

几点说明：

- 采用 **onedir 而非 onefile**：onefile 每次启动都要把约 220MB 解压到临时目录，启动会慢好几秒。
- 目前**没有配置图标**，用的是 PyInstaller 默认图标。
- 排查打包期问题时，用 `$env:LFA_DEBUG_CONSOLE = "1"; .\desktop\build.ps1` 保留控制台窗口，可看到启动报错。

## 模型配置说明

模型与提供商配置独立在 `web/config.js` 文件中，设置弹窗（识别方式、提供商、模型、API 密钥）都从它派生。

### 配置文件结构

```javascript
// 云端提供商：key = 提供商 id（密钥按 apiKey_<id> 分开存）
const providerConfig = {
    siliconflow: {
        name: "硅基流动",
        apiUrl: "https://api.siliconflow.cn/v1/chat/completions",
        models: {
            "Qwen3-VL-8B-Instruct": {
                name: "Qwen/Qwen3-VL-8B-Instruct",
                displayName: "Qwen3-VL-8B-Instruct(￥2.00/M Tokens)"
            }
        }
    }
};

// 本地模型（仅桌面版，按需下载）
const localModelConfig = {
    "rapid-latex-ocr": {
        name: "rapid-latex-ocr",
        displayName: "RapidLaTeXOCR（本地·CPU·171MB）"
    }
};
```

### 添加新提供商 / 新模型

- **新云端厂商**：在 `providerConfig` 里加一条（`name` / `apiUrl` / `models`），设置弹窗的"提供商"下拉会自动出现。
- **厂商下新模型**：在该厂商的 `models` 里加一项即可，模型下拉自动显示。
- **新本地模型**：在 `localModelConfig` 里加一项，`name` 需与 `backend/inference` 注册的模型 key 一致。

## 依赖项
- **Bootstrap**：用于页面布局和样式。
    - [Bootstrap](https://getbootstrap.com/)
- **Temml**：用于LaTeX到MathML的转换。
    - [Temml](https://temml.org/)
- **多模态大模型**：
    - Qwen2.5-VL-32B-Instruct
    - Qwen2.5-VL-7B-Instruct


## 常见问题
- **Q: 如何解决API密钥无效的问题？**
    - A: 确保您输入的API密钥正确，并检查网络连接。
- **Q: 如何切换不同的模型？**
    - A: 在页面左侧的“选择模型”下拉框中选择所需的模型。
- **Q: 为什么公式渲染失败？**
    - A: 检查LaTeX代码是否正确，或者尝试更换图片。

