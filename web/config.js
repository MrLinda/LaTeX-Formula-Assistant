// 模型与提供商配置文件
//
// 识别方式两种：
//   local  -> 走本地 Python 后端（仅 PyWebView 桌面版），无需 API 密钥
//   cloud  -> 走云端提供商 API，需对应提供商的 API 密钥
//
// 云端按"提供商"组织：以后接新厂商只需在 providerConfig 里加一条，
// 设置弹窗的"提供商"下拉会自动出现，其余逻辑（密钥、模型下拉、
// 接口地址、错误文案）都从这里派生。

// === 云端提供商注册表（key = 提供商 id） ===
const providerConfig = {
    siliconflow: {
        name: "硅基流动",
        apiUrl: "https://api.siliconflow.cn/v1/chat/completions",
        models: {
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
            }
        }
    }
};

// === 本地模型（仅桌面版，按需下载）===
// name 必须与 backend/inference 里注册的模型 key 一致
const localModelConfig = {
    "rapid-latex-ocr": {
        name: "rapid-latex-ocr",
        displayName: "RapidLaTeXOCR（本地·CPU·171MB）"
    }
};

// ---- 存储键 ----
// recognizeMode:     'local' | 'cloud'（仅桌面版有意义）
// selectedProvider:  云端提供商 id
// apiKey_<provider>: 按提供商分开存的 API 密钥
// selectedModel:     云端选中的模型 key（沿用旧键，方便迁移）
// selectedLocalModel: 本地选中的模型 key

function isDesktopEnv() {
    return typeof window !== 'undefined' && !!window.LOCAL_API_BASE;
}

function apiKeyStorageKey(providerId) {
    return 'apiKey_' + providerId;
}

// 旧版单提供商配置迁移过来（只跑一次即可，幂等）：
//   - 旧的单一 apiKey          -> 硅基流动的 apiKey_siliconflow
//   - 旧的 selectedModel 是本地模型 key -> selectedLocalModel + recognizeMode=local
//   - 全新用户：桌面版默认本地（与旧版下拉首项一致），网页版默认云端
function migrateSettings() {
    try {
        const oldKey = localStorage.getItem('apiKey');
        if (oldKey && !localStorage.getItem('apiKey_siliconflow')) {
            localStorage.setItem('apiKey_siliconflow', oldKey);
        }

        const savedModel = localStorage.getItem('selectedModel');
        if (savedModel && !localStorage.getItem('recognizeMode')) {
            if (localModelConfig[savedModel]) {
                localStorage.setItem('selectedLocalModel', savedModel);
                localStorage.removeItem('selectedModel');
                localStorage.setItem('recognizeMode', 'local');
            } else {
                localStorage.setItem('recognizeMode', 'cloud');
            }
        }

        if (!localStorage.getItem('recognizeMode')) {
            localStorage.setItem('recognizeMode', isDesktopEnv() ? 'local' : 'cloud');
        }
    } catch (_) {
        // localStorage 不可用（隐私模式等）：按默认值继续，不影响主流程
    }
}

function getRecognizeMode() {
    if (!isDesktopEnv()) return 'cloud';
    let saved = null;
    try { saved = localStorage.getItem('recognizeMode'); } catch (_) { /* 读不到走默认 */ }
    return saved === 'local' ? 'local' : 'cloud';
}

function setRecognizeMode(mode) {
    try {
        localStorage.setItem('recognizeMode', mode === 'local' ? 'local' : 'cloud');
    } catch (_) { /* 存不上不影响本次使用 */ }
}

// 当前提供商：存的 id 不在注册表里（比如以后被删掉）就退回第一个
function getSelectedProviderId() {
    let id = '';
    try { id = localStorage.getItem('selectedProvider') || ''; } catch (_) { /* 走默认 */ }
    if (!providerConfig[id]) {
        id = Object.keys(providerConfig)[0];
    }
    return id;
}

function saveSelectedProvider(providerId) {
    try { localStorage.setItem('selectedProvider', providerId); } catch (_) { /* 忽略 */ }
}

function getSelectedProvider() {
    return providerConfig[getSelectedProviderId()] || null;
}

// 生成"提供商"下拉框的选项
function generateProviderOptions() {
    const select = document.getElementById('providerSelect');
    if (!select) return;

    select.innerHTML = '';
    for (const id in providerConfig) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = providerConfig[id].name;
        select.appendChild(option);
    }
    select.value = getSelectedProviderId();
}

// 生成"云端模型"下拉框的选项（按当前提供商过滤）
function generateModelOptions() {
    const modelSelect = document.getElementById('modelSelect');
    if (!modelSelect) return;
    modelSelect.innerHTML = '';

    const provider = getSelectedProvider();
    const models = provider ? provider.models : {};
    for (const key in models) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = models[key].displayName;
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

// 生成"本地模型"下拉框的选项（仅桌面版用得到）
function generateLocalModelOptions() {
    const select = document.getElementById('localModelSelect');
    if (!select) return;

    select.innerHTML = '';
    for (const key in localModelConfig) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = localModelConfig[key].displayName;
        select.appendChild(option);
    }

    let saved = '';
    try { saved = localStorage.getItem('selectedLocalModel') || ''; } catch (_) { /* 走默认 */ }
    if (saved && localModelConfig[saved]) {
        select.value = saved;
    }
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

// 加载上次选择的模型（仅在当前提供商的模型列表里找，切换提供商后自动退回首项）
function loadSelectedModel() {
    const modelSelect = document.getElementById('modelSelect');
    if (!modelSelect) return;

    const savedModel = localStorage.getItem('selectedModel');
    const provider = getSelectedProvider();
    const models = provider ? provider.models : {};

    if (savedModel === 'custom') {
        modelSelect.value = 'custom';
        const customInput = document.getElementById('customModelInput');
        const savedCustomName = localStorage.getItem('customModelName');
        if (customInput && savedCustomName) {
            customInput.value = savedCustomName;
        }
        toggleCustomModelInput();
    } else if (savedModel && models[savedModel]) {
        modelSelect.value = savedModel;
        hideCustomModelInput();
    } else {
        // 该提供商下没有已存的选择（如刚切换提供商）：默认第一个模型
        hideCustomModelInput();
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

// 获取当前选中的云端模型名称
function getSelectedModelName() {
    const modelSelect = document.getElementById('modelSelect');
    if (!modelSelect) return '';
    if (modelSelect.value === 'custom') {
        const customInput = document.getElementById('customModelInput');
        return customInput ? customInput.value.trim() : '';
    }
    const provider = getSelectedProvider();
    const model = provider ? provider.models[modelSelect.value] : null;
    return model ? model.name : '';
}

// 获取当前选中的本地模型名称（识别方式为 local 时用）
function getSelectedLocalModelName() {
    const select = document.getElementById('localModelSelect');
    const key = select ? select.value : '';
    return localModelConfig[key] ? localModelConfig[key].name : '';
}

// 按识别方式切换弹窗里"云端设置 / 本地设置"两块的可见性，
// 并刷新 API 密钥标签上的提供商名
function applySettingsVisibility() {
    const cloud = document.getElementById('cloudSettings');
    const local = document.getElementById('localSettings');
    const mode = getRecognizeMode();
    if (cloud) cloud.style.display = mode === 'cloud' ? '' : 'none';
    if (local) local.style.display = mode === 'local' ? '' : 'none';

    const label = document.getElementById('apiKeyProviderName');
    const provider = getSelectedProvider();
    if (label) label.textContent = provider ? `（${provider.name}）` : '';
}

// 设置弹窗初始化入口（script.js 在 DOMContentLoaded 里调用一次）
function initSettingsUI() {
    migrateSettings();

    // 识别方式只在桌面版露出；纯 web 恒为云端
    const modeGroup = document.getElementById('recognizeModeGroup');
    if (modeGroup) modeGroup.style.display = isDesktopEnv() ? '' : 'none';

    generateProviderOptions();
    generateModelOptions();
    generateLocalModelOptions();

    const mode = getRecognizeMode();
    const modeRadio = document.getElementById(mode === 'local' ? 'modeLocal' : 'modeCloud');
    if (modeRadio) modeRadio.checked = true;

    applySettingsVisibility();
}

// 导出配置和相关函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        providerConfig,
        localModelConfig,
        initSettingsUI,
        applySettingsVisibility,
        getRecognizeMode,
        setRecognizeMode,
        getSelectedProviderId,
        getSelectedProvider,
        saveSelectedProvider,
        getSelectedModelName,
        getSelectedLocalModelName,
        saveSelectedModel,
        generateModelOptions,
        apiKeyStorageKey
    };
} else if (typeof window !== 'undefined') {
    window.providerConfig = providerConfig;
    window.localModelConfig = localModelConfig;
    window.initSettingsUI = initSettingsUI;
    window.applySettingsVisibility = applySettingsVisibility;
    window.getRecognizeMode = getRecognizeMode;
    window.setRecognizeMode = setRecognizeMode;
    window.getSelectedProviderId = getSelectedProviderId;
    window.getSelectedProvider = getSelectedProvider;
    window.saveSelectedProvider = saveSelectedProvider;
    window.getSelectedModelName = getSelectedModelName;
    window.getSelectedLocalModelName = getSelectedLocalModelName;
    window.saveSelectedModel = saveSelectedModel;
    window.generateModelOptions = generateModelOptions;
    window.toggleCustomModelInput = toggleCustomModelInput;
    window.hideCustomModelInput = hideCustomModelInput;
    window.apiKeyStorageKey = apiKeyStorageKey;
}
