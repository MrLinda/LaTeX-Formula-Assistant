// 模型配置文件
const modelConfig = {
    "Qwen2.5-VL-7B": {
        name: "Pro/Qwen/Qwen2.5-VL-7B-Instruct",
        displayName: "Qwen2.5-VL-7B(￥0.35/M Tokens)"
    },
    "Qwen2.5-VL-32B": {
        name: "Qwen/Qwen2.5-VL-32B-Instruct",
        displayName: "Qwen2.5-VL-32B(￥1.89/M Tokens)"
    },
    "Qwen3-VL-30B-A3B-Instruct": {
        name: "Qwen/Qwen3-VL-30B-A3B-Instruct",
        displayName: "Qwen3-VL-30B-A3B-Instruct(￥2.80/M Tokens)"
    },
    "GLM-4.1V-9B-Thinking(Free)": {
        name: "THUDM/GLM-4.1V-9B-Thinking",
        displayName: "GLM-4.1V-9B-Thinking(￥0.00/M Tokens)"
    },
    "GLM-4.1V-9B-Thinking(Paid)": {
        name: "Pro/THUDM/GLM-4.1V-9B-Thinking",
        displayName: "GLM-4.1V-9B-Thinking(￥1.00/M Tokens)"
    },
};

// 生成模型选择下拉框的选项
function generateModelOptions() {
    const modelSelect = document.getElementById('modelSelect');
    // 清空现有选项
    modelSelect.innerHTML = '';
    
    // 为每个模型添加选项
    for (const key in modelConfig) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = modelConfig[key].displayName;
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