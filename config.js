// 模型配置文件
const modelConfig = {
    "Qwen3-VL-8B-Instruct": {
        name: "Qwen/Qwen3-VL-8B-Instruct",
        displayName: "Qwen3-VL-8B-Instruct(￥2.00/M Tokens)"
    },
    "Qwen3-VL-30B-A3B-Instruct": {
        name: "Qwen/Qwen3-VL-30B-A3B-Instruct",
        displayName: "Qwen3-VL-30B-A3B-Instruct(￥2.80/M Tokens)"
    },
    "Qwen3-VL-32B-Instruct": {
        name: "Qwen/Qwen3-VL-32B-Instruct",
        displayName: "Qwen3-VL-32B-Instruct(￥4.00/M Tokens)"
    },
    "GLM-4.1V-9B-Thinking(Free)": {
        name: "THUDM/GLM-4.1V-9B-Thinking",
        displayName: "GLM-4.1V-9B-Thinking(￥0.00/M Tokens)"
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

    // 添加分隔线
    const separatorOpt = document.createElement('option');
    separatorOpt.value = '';
    separatorOpt.textContent = '──────────';
    separatorOpt.disabled = true;
    modelSelect.appendChild(separatorOpt);

    // 添加"自己输入"选项
    const customOption = document.createElement('option');
    customOption.value = 'custom';
    customOption.textContent = '自己输入模型代号...';
    modelSelect.appendChild(customOption);

    // 从本地存储加载上次选择的模型
    loadSelectedModel();
}

// 保存选择的模型
function saveSelectedModel(modelKey) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('selectedModel', modelKey);
            // 如果是自定义模型，同时保存自定义模型名
            if (modelKey === 'custom') {
                const customInput = document.getElementById('customModelInput');
                localStorage.setItem('customModelName', customInput ? customInput.value.trim() : '');
            }
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

    if (savedModel === 'custom') {
        modelSelect.value = 'custom';
        const customInput = document.getElementById('customModelInput');
        const savedCustomName = localStorage.getItem('customModelName');
        if (customInput && savedCustomName) {
            customInput.value = savedCustomName;
        }
        toggleCustomModelInput();
    } else if (savedModel && modelConfig[savedModel]) {
        modelSelect.value = savedModel;
    }
}

// 切换自定义模型输入框的显示/隐藏
function toggleCustomModelInput() {
    const customInput = document.getElementById('customModelInput');
    if (customInput) {
        customInput.style.display = 'block';
    }
}

function hideCustomModelInput() {
    const customInput = document.getElementById('customModelInput');
    if (customInput) {
        customInput.style.display = 'none';
    }
}

// 获取当前选中的模型名称
function getSelectedModelName() {
    const modelSelect = document.getElementById('modelSelect');
    if (modelSelect.value === 'custom') {
        const customInput = document.getElementById('customModelInput');
        return customInput ? customInput.value.trim() : '';
    }
    return modelConfig[modelSelect.value] ? modelConfig[modelSelect.value].name : '';
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
    window.saveSelectedModel = saveSelectedModel;
    window.getSelectedModelName = getSelectedModelName;
    window.toggleCustomModelInput = toggleCustomModelInput;
    window.hideCustomModelInput = hideCustomModelInput;
}