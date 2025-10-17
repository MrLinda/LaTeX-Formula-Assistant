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

## 模型配置说明

为了便于管理和扩展，模型配置已独立到单独的 `config.js` 文件中。

### 配置文件结构

```javascript
const modelConfig = {
    "模型标识符": {
        name: "实际模型名称",
        displayName: "显示名称"
    }
};
```

### 添加新模型

只需在 `modelConfig` 对象中添加新的模型配置即可，系统会自动在界面中显示。

### 示例

```javascript
const modelConfig = {
    "Qwen2.5-VL-32B": {
        name: "Qwen/Qwen2.5-VL-32B-Instruct",
        displayName: "Qwen2.5-VL-32B"
    },
    "Qwen2.5-VL-7B": {
        name: "Pro/Qwen/Qwen2.5-VL-7B-Instruct",
        displayName: "Qwen2.5-VL-7B"
    },
};
```

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

