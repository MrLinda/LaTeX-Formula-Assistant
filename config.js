// 模型配置文件
// provider: "cloud"  -> 走 SiliconFlow API，需 API 密钥
// provider: "local"  -> 走本地 Python 后端（PyWebView 桌面版），无需 API 密钥
const modelConfig = {
    // === 本地模型（桌面版，按需下载）===
    "pp-formulanet-s": {
        name: "pp-formulanet-s",
        displayName: "PP-FormulaNet-S（本地·英文·224MB）",
        provider: "local"
    },
    "pp-formulanet-plus-m": {
        name: "pp-formulanet-plus-m",
        displayName: "PP-FormulaNet_plus-M（本地·中文·592MB）",
        provider: "local"
    },
    "unimernet-tiny": {
        name: "unimernet-tiny",
        displayName: "UniMERNet-tiny（本地·~250MB）",
        provider: "local"
    },
    "latex-ocr-rec": {
        name: "latex-ocr-rec",
        displayName: "LaTeX_OCR_rec（本地·英文·99MB）",
        provider: "local"
    },
    // === 云端模型（SiliconFlow）===
    "Qwen2.5-VL-7B": {
        name: "Pro/Qwen/Qwen2.5-VL-7B-Instruct",
        displayName: "Qwen2.5-VL-7B(￥0.35/M Tokens)",
        provider: "cloud"
    },
    "Qwen2.5-VL-32B": {
        name: "Qwen/Qwen2.5-VL-32B-Instruct",
        displayName: "Qwen2.5-VL-32B(￥1.89/M Tokens)",
        provider: "cloud"
    },
    "Qwen3-VL-8B-Instruct": {
        name: "Qwen/Qwen3-VL-8B-Instruct",
        displayName: "Qwen3-VL-8B-Instruct(￥2.00/M Tokens)",
        provider: "cloud"
    },
    "Qwen3-VL-30B-A3B-Instruct": {
        name: "Qwen/Qwen3-VL-30B-A3B-Instruct",
        displayName: "Qwen3-VL-30B-A3B-Instruct(￥2.80/M Tokens)",
        provider: "cloud"
    },
    "Qwen3-VL-32B-Instruct": {
        name: "Qwen/Qwen3-VL-32B-Instruct",
        displayName: "Qwen3-VL-32B-Instruct(￥4.00/M Tokens)",
        provider: "cloud"
    },
    "GLM-4.1V-9B-Thinking(Free)": {
        name: "THUDM/GLM-4.1V-9B-Thinking",
        displayName: "GLM-4.1V-9B-Thinking(￥0.00/M Tokens)",
        provider: "cloud"
    },
    "GLM-4.1V-9B-Thinking(Paid)": {
        name: "Pro/THUDM/GLM-4.1V-9B-Thinking",
        displayName: "GLM-4.1V-9B-Thinking(￥1.00/M Tokens)",
        provider: "cloud"
    },
};

// 生成模型选择下拉框的选项
function generateModelOptions() {
    const modelSelect = document.getElementById('modelSelect');
    // 清空现有选项
    modelSelect.innerHTML = '';

    // 只有桌面版（LOCAL_API_BASE 存在）才显示本地模型；纯 web 环境下自动跳过。
    const isDesktop = typeof window !== 'undefined' && !!window.LOCAL_API_BASE;

    // 为每个模型添加选项
    for (const key in modelConfig) {
        const cfg = modelConfig[key];
        if (cfg.provider === 'local' && !isDesktop) {
            continue;
        }
        const option = document.createElement('option');
        option.value = key;
        option.textContent = cfg.displayName;
        option.dataset.provider = cfg.provider || 'cloud';
        modelSelect.appendChild(option);
    }
    
    // 添加"待添加"选项
    const placeholderOption = document.createElement('option');
    placeholderOption.value = 'other';
    placeholderOption.textContent = '待添加';
    placeholderOption.disabled = true;
    modelSelect.appendChild(placeholderOption);
    
    // 从本地存储加载上次选择的模型
    loadSelectedModel();
}

// 保存选择的模型
function saveSelectedModel(modelKey) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('selectedModel', modelKey);
        }
    } catch (e) {
        console.error('Failed to save selected model to localStorage:', e);
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert('无法将模型选择保存到本地存储。您的选择将在刷新页面后丢失。');
        }
    }
}

// 加载上次选择的模型
function loadSelectedModel() {
    const modelSelect = document.getElementById('modelSelect');
    const savedModel = localStorage.getItem('selectedModel');
    
    if (savedModel && modelConfig[savedModel]) {
        modelSelect.value = savedModel;
    }
}

// 导出模型配置和相关函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        modelConfig,
        generateModelOptions
    };
} else if (typeof window !== 'undefined') {
    window.modelConfig = modelConfig;
    window.generateModelOptions = generateModelOptions;
}