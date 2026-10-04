// 全局变量，用于跟踪是否正在加载
let isLoading = false;

// 历史记录数组，用于存储最近复制的LaTeX代码
let historyList = [];
// 历史记录最大数量
const MAX_HISTORY_ITEMS = 20;

// 最近一次上传的图片（用于差评反馈时上传原图）
let lastImageBlob = null;
// 最近一次服务端识别的结果 { id, blob }；非服务端识别时为 null
let lastServerRecognition = null;

document.addEventListener('DOMContentLoaded', function() {
    // 从本地存储加载历史记录
    loadHistory();
    
    // 更新历史记录UI
    updateHistoryUI();

    // 监听粘贴事件
    document.addEventListener('paste', handlePaste);

    // 拖拽上传：dragover 拦下文件拖入（浏览器才允许 drop，也不会把文件当页面打开），
    // 只拦 Files —— 文本等其它拖拽行为保持浏览器默认
    document.addEventListener('dragover', function(e) {
        if (e.dataTransfer && Array.prototype.includes.call(e.dataTransfer.types || [], 'Files')) {
            e.preventDefault();
        }
    });
    document.addEventListener('drop', function(e) {
        if (!e.dataTransfer || !Array.prototype.includes.call(e.dataTransfer.types || [], 'Files')) return;
        e.preventDefault();
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        acceptImageFile(file);
    });

    // 监听文件上传
    document.getElementById('imageUpload').addEventListener('change', handleFileSelect);

    // 监听LaTeX输入变化
    document.getElementById('latexInput').addEventListener('input', renderLaTeX);

    // 监听API密钥保存按钮
    document.getElementById('saveApiKeyButton').addEventListener('click', saveApiKey);

    // 监听复制LaTeX按钮
    document.getElementById('copyLaTeXButton').addEventListener('click', copyLaTeX);

    // 监听复制MathML按钮
    document.getElementById('copyMathMLButton').addEventListener('click', copyMathML);
    
    // 监听清空历史记录按钮
    document.getElementById('clearHistoryButton').addEventListener('click', function() {
        // 显示Bootstrap模态框
        const clearHistoryModal = new bootstrap.Modal(document.getElementById('clearHistoryModal'));
        clearHistoryModal.show();
    });
    
    // 监听确认清空按钮
    document.getElementById('confirmClearHistory').addEventListener('click', function() {
        // 关闭模态框
        const clearHistoryModal = bootstrap.Modal.getInstance(document.getElementById('clearHistoryModal'));
        clearHistoryModal.hide();
        
        // 清空历史记录
        historyList = [];
        localStorage.removeItem('latexHistory');
        updateHistoryUI();
        showToast('历史记录已清空');
    });

    // 初始化设置弹窗内容（迁移旧配置、填充提供商/云端模型/本地模型下拉）
    if (typeof initSettingsUI === 'function') {
        initSettingsUI();
    }

    // 服务端设置区块（地址、登录、余额、兑换码、模型下拉）
    if (typeof initServerSettingsUI === 'function') {
        initServerSettingsUI();
    }

    // 识别结果反馈按钮
    const feedbackGoodButton = document.getElementById('feedbackGoodButton');
    if (feedbackGoodButton) feedbackGoodButton.addEventListener('click', sendGoodFeedback);
    const feedbackBadButton = document.getElementById('feedbackBadButton');
    if (feedbackBadButton) feedbackBadButton.addEventListener('click', openFeedbackModal);
    const feedbackSubmitButton = document.getElementById('feedbackSubmitButton');
    if (feedbackSubmitButton) feedbackSubmitButton.addEventListener('click', submitBadFeedback);

    // 已登录服务端账号时静默恢复会话（必要时刷新 access），并拉模型与公告
    if (typeof isServerLoggedIn === 'function' && isServerLoggedIn()) {
        serviceEnsureAccessToken(false).then(function() {
            renderServerAuthState();
            refreshServerModels();
            // 缓存的用户对象可能是老数据（没有抽奖次数字段），恢复会话时拉一次完整账号信息
            refreshServerAccount();
        });
    }
    loadAnnouncements();
    
    // 监听模型选择变化
    document.getElementById('modelSelect').addEventListener('change', function() {
        if (typeof saveSelectedModel === 'function') {
            saveSelectedModel(this.value);
        }
        if (this.value === 'custom') {
            if (typeof toggleCustomModelInput === 'function') {
                toggleCustomModelInput();
            }
        } else {
            if (typeof hideCustomModelInput === 'function') {
                hideCustomModelInput();
            }
        }
    });

    // 监听自定义模型输入变化，实时保存
    document.getElementById('customModelInput').addEventListener('input', function() {
        if (typeof saveSelectedModel === 'function') {
            saveSelectedModel('custom');
        }
    });

    // 监听提供商切换：模型下拉按新提供商重建，密钥框载入该提供商的密钥
    document.getElementById('providerSelect').addEventListener('change', function() {
        if (typeof saveSelectedProvider === 'function') {
            saveSelectedProvider(this.value);
        }
        if (typeof generateModelOptions === 'function') {
            generateModelOptions();
        }
        loadApiKey();
        if (typeof applySettingsVisibility === 'function') {
            applySettingsVisibility();
        }
    });

    // 监听识别方式切换（本地 / 云端 / 服务端）
    document.querySelectorAll('input[name="recognizeMode"]').forEach(function(radio) {
        radio.addEventListener('change', function() {
            if (!this.checked) return;
            if (typeof setRecognizeMode === 'function') setRecognizeMode(this.value);
            if (typeof applySettingsVisibility === 'function') applySettingsVisibility();
            if (this.value === 'server') {
                renderServerAuthState();
                if (typeof isServerLoggedIn === 'function' && isServerLoggedIn()) {
                    refreshServerModels();
                }
            }
        });
    });

    // 监听本地模型选择（仅桌面版）
    const localModelSelect = document.getElementById('localModelSelect');
    if (localModelSelect) {
        localModelSelect.addEventListener('change', function() {
            try { localStorage.setItem('selectedLocalModel', this.value); } catch (_) { /* 存不上不影响本次使用 */ }
        });
    }

    // 打开设置弹窗（backdrop 为 static：点外面不关闭，只有 × 和「完成」能关）
    document.getElementById('openSettingsButton').addEventListener('click', function() {
        const modalEl = document.getElementById('settingsModal');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    });

    // 初始化主题三档切换（亮 / 暗 / 自动，head 里的提前脚本已落过首帧）
    initThemeToggle();

    // 初始化公式字号设置（须在 renderLaTeX 之前，保证首帧就按设置渲染）
    initFormulaFontSizeSettings();

    // 初始化Temml渲染
    renderLaTeX();

    // 公式预览弹窗
    document.getElementById('openPreviewModal').addEventListener('click', openPreviewModal);
    document.getElementById('closePreviewModal').addEventListener('click', closePreviewModal);
    document.getElementById('previewModal').addEventListener('click', function(e) {
        if (e.target === this) closePreviewModal();
    });

    // 尝试从本地存储加载API密钥
    loadApiKey();

    // 环境初始化完毕，交给可选的布局外壳（桌面版为 desktop.js，网页版无监听者）
    document.dispatchEvent(new CustomEvent('app:ready'));
});

/* ==========================================================================
   主题三档切换（亮色 / 暗色 / 自动跟随系统）
   存储键 themeMode：'light' | 'dark' | 'auto'（缺省视为 auto）。
   实际生效的亮暗写在 <html data-bs-theme>，index.html 头部脚本负责首帧防闪。
   ========================================================================== */
const THEME_KEY = 'themeMode';
const THEME_ORDER = ['light', 'dark', 'auto'];
const THEME_META = {
    light: { icon: '☀', label: '亮色' },
    dark:  { icon: '🌙', label: '暗色' },
    auto:  { icon: '🖥', label: '自动' }
};

function getThemeMode() {
    try {
        const mode = localStorage.getItem(THEME_KEY);
        if (THEME_ORDER.includes(mode)) return mode;
    } catch (_) { /* 存储不可用则退回自动 */ }
    return 'auto';
}

// 三档 -> 实际亮暗（auto 查系统偏好）
function resolveTheme(mode) {
    if (mode !== 'auto') return mode;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}

function applyTheme() {
    const mode = getThemeMode();
    document.documentElement.setAttribute('data-bs-theme', resolveTheme(mode));

    const btn = document.getElementById('themeToggleButton');
    if (btn) {
        const meta = THEME_META[mode];
        const next = THEME_META[THEME_ORDER[(THEME_ORDER.indexOf(mode) + 1) % THEME_ORDER.length]];
        btn.innerHTML = meta.icon + '<span class="theme-label"> ' + meta.label + '</span>';
        btn.title = '主题：' + meta.label + '（点击切换为' + next.label + '）';
        btn.setAttribute('aria-label', btn.title);
    }
}

function initThemeToggle() {
    const btn = document.getElementById('themeToggleButton');
    if (btn) {
        btn.addEventListener('click', function() {
            const next = THEME_ORDER[(THEME_ORDER.indexOf(getThemeMode()) + 1) % THEME_ORDER.length];
            try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* 存不上仍可切换本次 */ }
            applyTheme();
        });
    }
    applyTheme(); // 同步按钮文案；首帧属性由 head 脚本落过，这里幂等重写

    // 「自动」档跟随系统深浅色实时切换
    if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const onSystemChange = function() {
            if (getThemeMode() === 'auto') applyTheme();
        };
        if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onSystemChange);
        else if (typeof mq.addListener === 'function') mq.addListener(onSystemChange);
    }
}

// 保存到历史记录
function saveToHistory(latexCode) {
    if (!latexCode || latexCode.trim() === '') return;
    
    // 检查是否已经存在相同的条目（避免重复）
    const exists = historyList.some(item => item.code === latexCode);
    if (!exists) {
        // 添加新的历史记录项
        historyList.unshift({
            code: latexCode,
            timestamp: new Date().toISOString()
        });
        
        // 限制历史记录数量
        if (historyList.length > MAX_HISTORY_ITEMS) {
            historyList = historyList.slice(0, MAX_HISTORY_ITEMS);
        }
        
        // 保存到本地存储
        localStorage.setItem('latexHistory', JSON.stringify(historyList));
        
        // 更新历史记录UI
        updateHistoryUI();
    }
}

// 从本地存储加载历史记录
function loadHistory() {
    const savedHistory = localStorage.getItem('latexHistory');
    if (savedHistory) {
        try {
            historyList = JSON.parse(savedHistory);
            // 确保历史记录数量不超过最大值
            if (historyList.length > MAX_HISTORY_ITEMS) {
                historyList = historyList.slice(0, MAX_HISTORY_ITEMS);
            }
        } catch (error) {
            console.error('加载历史记录失败:', error);
            historyList = [];
        }
    }
}

// 保存API密钥（按当前选中的提供商分开存：apiKey_<providerId>）
function saveApiKey() {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const apiKey = apiKeyInput.value.trim();

    if (apiKey) {
        localStorage.setItem(apiKeyStorageKey(getSelectedProviderId()), apiKey);
        showAlert('API密钥已保存！');
    } else {
        showAlert('请输入有效的API密钥');
    }
}

// 加载API密钥（初始化与切换提供商时都调用，载入当前提供商的密钥）
function loadApiKey() {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const savedApiKey = localStorage.getItem(apiKeyStorageKey(getSelectedProviderId()));

    apiKeyInput.value = savedApiKey || '';
}

// 处理粘贴事件
function handlePaste(e) {
    if (isLoading) {
        e.preventDefault(); // 阻止粘贴
        return;
    }

    // 检查当前焦点是否在输入框上
    const focusedElement = document.activeElement;
    const apiKeyInput = document.getElementById('apiKeyInput');
    const latexInput = document.getElementById('latexInput');

    // 如果焦点在输入框上，则允许正常粘贴
    if (focusedElement === apiKeyInput || focusedElement === latexInput) {
        return;
    }

    // 检查粘贴内容是否为图片
    const clipboardData = e.clipboardData || e.originalEvent.clipboardData;
    const items = clipboardData.items;

    // 假设默认是文本
    let isImage = false;

    for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
            isImage = true;
            break;
        }
    }

    if (isImage) {
        e.preventDefault();
        let blob = null;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                blob = items[i].getAsFile();
                break;
            }
        }

        if (blob) {
            // 显示加载动画
            showLoading();
            processImage(blob);
        }
    }
    // 如果不是图片，允许正常粘贴
}

// 处理文件选择（点击选文件与拖拽落下的文件都走这里）
function handleFileSelect(e) {
    acceptImageFile(e.target.files[0]);
}

// 接收一张图片文件：非图片或正在识别时忽略
function acceptImageFile(file) {
    if (isLoading) {
        return; // 如果正在加载，直接返回
    }

    if (file && file.type.startsWith('image/')) {
        // 显示加载动画
        showLoading();
        processImage(file);
    }
}

// 处理图片
function processImage(file) {
    const reader = new FileReader();

    reader.onload = function(event) {
        const base64Data = event.target.result.split(',')[1];
        lastImageBlob = file;

        // 显示图片预览
        const imagePreview = document.getElementById('imagePreview');
        imagePreview.innerHTML = `<img src="${event.target.result}" class="img-fluid">`;

        // 调用自定义API
        callCustomAPI(base64Data);
    };

    reader.readAsDataURL(file);
}

// 调用识别 API：按"识别方式"分流 —— local 走桌面版本地推理，
// server 走私有服务端，cloud 走当前云端提供商
async function callCustomAPI(base64Data) {
    const mode = typeof getRecognizeMode === 'function' ? getRecognizeMode() : 'cloud';
    if (mode === 'local') {
        return callLocalAPI(base64Data, getSelectedLocalModelName());
    }
    if (mode === 'server') {
        return callServerAPI(base64Data);
    }
    return callCloudAPI(base64Data);
}

// 应用识别结果到 UI（云端/本地共用）
// stats: { tokens: number } 走云端，{ elapsed: number } 走本地推理
function applyRecognitionResult(rawLatex, stats) {
    let latexCode = rawLatex || '';

    // 使用正则表达式匹配并删除首尾的$$符号及其附近的换行符
    latexCode = latexCode.replace(/^\s*\$\$[\r\n]*|[\r\n]*\$\$\s*$/g, '');

    // 使用正则表达式匹配并删除首尾的```latex```代码块标记
    latexCode = latexCode.replace(/^\s*```latex[\r\n]*|[\r\n]*```\s*$/g, '');

    // 使用正则表达式匹配并删除首尾的\(和\)标签及其附近的换行符
    latexCode = latexCode.replace(/^\s*\\\([\r\n]*|[\r\n]*\\\)\s*$/g, '');

    // 使用正则表达式匹配并删除首尾的<|begin_of_box|>和<|end_of_box|>标签及其附近的换行符
    latexCode = latexCode.replace(/^\s*<\|begin_of_box\|>\s*|\s*<\|end_of_box\|>\s*$/g, '');

    // 更新输入框和渲染
    document.getElementById('latexInput').value = latexCode;
    renderLaTeX();

    updateUsageDisplay(stats);
}

// 本地推理不消耗 API Token，改为展示推理耗时；服务端识别额外展示扣费积分
function updateUsageDisplay(stats) {
    const label = document.getElementById('usageLabel');
    const value = document.getElementById('tokenCountDisplay');
    if (!label || !value) return;

    if (stats && typeof stats.elapsed === 'number') {
        label.textContent = '推理耗时';
        value.textContent = stats.elapsed.toFixed(2) + 's';
        return;
    }

    const tokens = stats && typeof stats.tokens === 'number' ? stats.tokens : 0;
    if (stats && typeof stats.points === 'number') {
        label.textContent = '本次使用Tokens / 扣费';
        value.textContent = tokens + ' / ' + formatPoints(stats.points) + ' 积分';
    } else {
        label.textContent = '本次使用Tokens';
        value.textContent = tokens;
    }
}

// 轮询后端下载进度并刷新遮罩文案；返回停止函数
function pollDownloadProgress(modelName, sizeBytes) {
    const mb = sizeBytes ? Math.round(sizeBytes / 1024 / 1024) : null;
    const prefix = `首次使用该模型，正在下载${mb ? `（约 ${mb}MB）` : ''}`;

    const tick = async function() {
        try {
            const resp = await fetch(`${window.LOCAL_API_BASE}/api/models/download/progress`);
            if (!resp.ok) return;
            const data = await resp.json();
            if (!data.active || !data.total) return;
            // 开头要探测下载源（直连失败才回退到镜像），这段时间是 0 字节，
            // 直接显示 0% 会像卡住，所以单独提示
            if (!data.downloaded) {
                showLoading(`${prefix} 正在连接下载源…`);
                return;
            }
            const done = (data.downloaded / 1024 / 1024).toFixed(1);
            const total = (data.total / 1024 / 1024).toFixed(1);
            showLoading(`${prefix} ${data.percent}%（${done}/${total} MB）`);
        } catch (_) {
            // 轮询失败不影响下载本身，静默忽略
        }
    };

    tick();
    const timer = setInterval(tick, 300);
    return function() { clearInterval(timer); };
}

// 下载本地模型（首次使用，同步等待后端完成），失败时抛出错误
async function downloadLocalModel(modelName, sizeBytes) {
    const mb = sizeBytes ? Math.round(sizeBytes / 1024 / 1024) : null;
    showLoading(`首次使用该模型，正在下载${mb ? `（约 ${mb}MB）` : ''}，请耐心等待…`);

    const stopPolling = pollDownloadProgress(modelName, sizeBytes);
    try {
        const resp = await fetch(`${window.LOCAL_API_BASE}/api/models/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelName })
        });

        if (!resp.ok) {
            const data = await resp.json().catch(() => ({}));
            throw new Error(data.detail || `状态码 ${resp.status}`);
        }
    } finally {
        stopPolling();
    }
}

// 调用本地 Python 后端识别（桌面版）
async function callLocalAPI(base64Data, modelName) {
    if (!window.LOCAL_API_BASE) {
        hideLoading();
        showAlert('本地推理不可用：未检测到桌面运行时。请使用云端模型或安装桌面版。');
        return;
    }

    try {
        const resp = await fetch(`${window.LOCAL_API_BASE}/api/recognize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelName, image_base64: base64Data })
        });

        if (resp.status === 409) {
            const data = await resp.json().catch(() => ({}));
            if (data.error !== 'model_not_downloaded') {
                hideLoading();
                showAlert(data.detail || '模型不可用');
                return;
            }
            // 首次使用该本地模型：下载完成后重试识别
            try {
                await downloadLocalModel(modelName, data.sizeBytes);
            } catch (err) {
                hideLoading();
                showAlert('模型下载失败：' + (err.message || err));
                return;
            }
            return callLocalAPI(base64Data, modelName);
        }

        if (!resp.ok) {
            hideLoading();
            const text = await resp.text().catch(() => '');
            throw new Error(`本地 API 调用失败，状态码: ${resp.status} ${text}`);
        }

        const data = await resp.json();
        hideLoading();

        if (data && typeof data.latex === 'string') {
            applyRecognitionResult(data.latex, { elapsed: data.elapsed });
        } else {
            showAlert('本地推理未返回有效结果。');
        }
    } catch (error) {
        console.error('Local API error:', error);
        hideLoading();
        showAlert('本地推理调用失败：' + (error.message || error));
    }
}

// 分类云端 API 错误：根据 HTTP 状态码和响应体给出精确提示
async function reportCloudAPIError(response) {
    let bodyText = '';
    let bodyJson = null;
    try {
        bodyText = await response.text();
        try { bodyJson = JSON.parse(bodyText); } catch (_) { /* 非 JSON */ }
    } catch (_) { /* body 读不出 */ }

    // 兼容 OpenAI 风格 {"error":{"message":"..."}} 与 SiliconFlow 风格 {"message":"..."}
    const detailMsg = (bodyJson && (
        (bodyJson.error && bodyJson.error.message) ||
        bodyJson.message ||
        (typeof bodyJson.error === 'string' ? bodyJson.error : '')
    )) || bodyText || '';

    console.error(`[Cloud API] HTTP ${response.status}`, bodyText);

    const balanceKeywords = /余额|balance|arrears|insufficient|quota|欠费|payment|充值/i;
    const status = response.status;
    const providerName = (typeof getSelectedProvider === 'function' && getSelectedProvider())
        ? getSelectedProvider().name
        : '云端服务';

    // 401: 未授权 → API 密钥错误
    if (status === 401) {
        return showAlert('API 密钥无效或已过期，请检查后重新保存。');
    }
    // 402: 需要付款 → 明确的余额不足
    if (status === 402) {
        return showAlert(`账户余额不足，请到 ${providerName} 充值后重试。`);
    }
    // 403: 权限被拒 → 可能是余额、账号、模型未开通
    if (status === 403) {
        if (balanceKeywords.test(detailMsg)) {
            return showAlert(`账户余额不足，请到 ${providerName} 充值后重试。`);
        }
        return showAlert('访问被拒绝：' + (detailMsg || '当前 API 密钥无权访问该模型。'));
    }
    // 404: 模型不存在 → 模型配置错误
    if (status === 404) {
        return showAlert(`模型不存在或未开通：请检查所选模型在 ${providerName} 是否可用。`);
    }
    // 400: 请求参数错误 → 通常是模型配置或图片有问题
    if (status === 400) {
        return showAlert('模型配置错误（400）：' + (detailMsg || '模型名或请求参数有误。'));
    }
    // 413: 图片过大
    if (status === 413) {
        return showAlert('图片体积过大，请压缩后重试。');
    }
    // 429: 速率限制，部分服务商也用它表示余额不足
    if (status === 429) {
        if (balanceKeywords.test(detailMsg)) {
            return showAlert(`账户余额不足，请到 ${providerName} 充值后重试。`);
        }
        return showAlert('请求过于频繁，请稍后重试。');
    }
    // 5xx: 服务端错误
    if (status >= 500 && status < 600) {
        return showAlert(`${providerName} 服务端错误（${status}），请稍后重试。`);
    }
    // 其它未知
    return showAlert(`未知错误（HTTP ${status}）：${detailMsg || '请检查网络与配置。'}`);
}

// 调用云端 SiliconFlow API
async function callCloudAPI(base64Data) {
    // ---- 预检查：网络 ----
    if (!navigator.onLine) {
        hideLoading();
        return showAlert('网络连接错误：当前无网络，请检查网络后重试。');
    }

    const provider = typeof getSelectedProvider === 'function' ? getSelectedProvider() : null;
    const providerName = provider ? provider.name : '云端服务';

    // ---- 预检查：API 密钥 ----
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    if (!apiKey) {
        hideLoading();
        return showAlert(`API 密钥为空：请打开「⚙ 设置」，填写${providerName} API 密钥并保存。`);
    }

    // ---- 预检查：模型配置（兼容自定义模型代号） ----
    const modelName = typeof getSelectedModelName === 'function' ? getSelectedModelName() : '';
    if (!modelName) {
        hideLoading();
        return showAlert('模型配置错误：请选择有效模型或填写自定义模型代号。');
    }

    // ---- 提供商接口地址（来自 providerConfig） ----
    const url = provider ? provider.apiUrl : '';
    if (!url) {
        hideLoading();
        return showAlert('提供商配置错误：缺少接口地址，请检查 config.js。');
    }
    const prompts = "请把图中的公式转成LaTeX格式，不要输出任何额外内容。";

    // ---- 发起请求，隔离网络层错误 ----
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: modelName,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/jpeg;base64,${base64Data}`,
                                    detail: "high"
                                }
                            },
                            {
                                type: "text",
                                text: prompts
                            }
                        ]
                    }
                ],
                stream: false,
                temperature: 0.7,
                top_p: 0.7,
                top_k: 50,
                max_tokens: 1024,
                stop: null,
                presence_penalty: 0.5,
                n: 1,
                response_format: { type: "text" }
            })
        });
    } catch (error) {
        console.error('[Cloud API] fetch error:', error);
        hideLoading();
        // fetch 抛异常通常是网络层问题：DNS 失败、断网、CORS、TLS 等
        if (error instanceof TypeError) {
            return showAlert(`网络连接错误：无法连接到 ${providerName}，请检查网络或代理。`);
        }
        return showAlert('未知错误：' + (error.message || String(error)));
    }

    // ---- 处理 HTTP 错误状态 ----
    if (!response.ok) {
        hideLoading();
        return reportCloudAPIError(response);
    }

    // ---- 解析响应 ----
    let data;
    try {
        data = await response.json();
    } catch (error) {
        console.error('[Cloud API] JSON parse error:', error);
        hideLoading();
        return showAlert(`未知错误：${providerName} 返回了无法解析的响应。`);
    }

    hideLoading();

    if (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
        const totalTokens = data.usage && data.usage.total_tokens ? data.usage.total_tokens : 0;
        applyRecognitionResult(data.choices[0].message.content, { tokens: totalTokens });
    } else {
        showAlert('识别失败：模型返回了空内容，请尝试其他图片或切换模型。');
    }
}

/* ==========================================================================
   私有服务端（LaTeX Formula Assistant Server）识别方式
   - 识别：POST /api/v1/recognitions（multipart），返回 recognition_id
   - 反馈：好/坏评价，差评可上传原图与修正 LaTeX
   - 账号：登录态、余额、兑换码、公告
   会话与 API 细节都在 service.js，这里只负责界面与流程编排。
   ========================================================================== */

// 积分统一显示 4 位小数（与服务端展示层约定一致）
function formatPoints(points) {
    const n = Number(points);
    if (!isFinite(n)) return '0.0000';
    return n.toFixed(4);
}

// 服务端识别失败时的文案分流
function reportServerAPIError(error) {
    const status = error && error.status;
    const message = error && error.message;

    if (error && error.name === 'ServerAPIError') {
        if (error.code === 'no_base_url') {
            return showAlert('未配置服务端地址：请打开「⚙ 设置」填写服务端地址并保存。');
        }
        if (error.code === 'network_error') {
            return showAlert('网络连接错误：无法连接到服务端，请检查地址、网络或代理。');
        }
        if (status === 401) {
            if (typeof clearServerSession === 'function') clearServerSession();
            renderServerAuthState();
            return showAlert('登录已失效，请重新登录服务端账号。');
        }
        if (status === 402) {
            return showAlert('积分不足：请在服务端账户页充值或使用兑换码后再试。');
        }
        if (status === 429) {
            return showAlert(message || '当前识别请求过多，请稍后重试。');
        }
        if (status === 502) {
            return showAlert(message || '云端模型暂时不可用，本次未扣费。');
        }
        if (status >= 500) {
            return showAlert('服务端错误（' + status + '）：请稍后重试。');
        }
        return showAlert(message || ('识别失败（HTTP ' + status + '）'));
    }
    return showAlert('识别失败：' + (message || String(error)));
}

// 调用私有服务端识别
async function callServerAPI(base64Data) {
    if (!navigator.onLine) {
        hideLoading();
        return showAlert('网络连接错误：当前无网络，请检查网络后重试。');
    }
    if (typeof getServerBaseUrl !== 'function' || !getServerBaseUrl()) {
        hideLoading();
        return showAlert('未配置服务端地址：请打开「⚙ 设置」→ 识别方式选「服务端」，填写服务端地址并保存。');
    }
    if (typeof isServerLoggedIn !== 'function' || !isServerLoggedIn()) {
        hideLoading();
        return showAlert('尚未登录服务端账号：请打开「⚙ 设置」登录后再试。');
    }
    const modelId = typeof getSelectedServerModelId === 'function' ? getSelectedServerModelId() : '';
    if (!modelId) {
        hideLoading();
        return showAlert('未选择模型：请在「⚙ 设置」中选择服务端模型。');
    }

    hideFeedbackButtons();

    let result;
    try {
        result = await serviceRecognize(base64Data, modelId);
    } catch (error) {
        hideLoading();
        return reportServerAPIError(error);
    }
    hideLoading();

    if (!result || typeof result.latex !== 'string') {
        return showAlert('识别失败：服务端返回了空内容，请尝试其他图片或切换模型。');
    }

    lastServerRecognition = {
        id: result.recognition_id || '',
        blob: lastImageBlob
    };
    applyRecognitionResult(result.latex, {
        tokens: (result.input_tokens || 0) + (result.output_tokens || 0),
        points: typeof result.charged_points === 'number' ? result.charged_points : undefined
    });
    updateFeedbackButtons();
    refreshServerAccount();
}

// ---- 反馈 ----

function updateFeedbackButtons() {
    const wrap = document.getElementById('feedbackButtons');
    if (!wrap) return;
    wrap.style.display = (lastServerRecognition && lastServerRecognition.id) ? '' : 'none';
}

function hideFeedbackButtons() {
    lastServerRecognition = null;
    const wrap = document.getElementById('feedbackButtons');
    if (wrap) wrap.style.display = 'none';
}

async function sendGoodFeedback() {
    if (!lastServerRecognition || !lastServerRecognition.id) return;
    try {
        await serviceSendFeedback(lastServerRecognition.id, { rating: 'good' });
        showToast('感谢反馈');
        hideFeedbackButtons();
    } catch (error) {
        showAlert('反馈提交失败：' + (error.message || error));
    }
}

function openFeedbackModal() {
    if (!lastServerRecognition || !lastServerRecognition.id) {
        showAlert('没有可反馈的识别记录，请先识别一张图片。');
        return;
    }
    const modalEl = document.getElementById('feedbackModal');
    if (!modalEl) return;

    const consent = document.getElementById('feedbackConsent');
    if (consent) consent.checked = false;

    bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

async function submitBadFeedback() {
    if (!lastServerRecognition || !lastServerRecognition.id) return;

    const consent = document.getElementById('feedbackConsent');
    if (!consent || !consent.checked) {
        return showAlert('请先勾选同意将图片用于内部测试');
    }
    if (!lastServerRecognition.blob) {
        return showAlert('缺少原始图片，无法提交困难样本。');
    }

    const correctionInput = document.getElementById('feedbackCorrectionInput');
    const problemType = document.getElementById('feedbackProblemType');
    const commentInput = document.getElementById('feedbackCommentInput');

    const button = document.getElementById('feedbackSubmitButton');
    if (button) button.disabled = true;
    try {
        const data = await serviceSendFeedback(lastServerRecognition.id, {
            rating: 'bad',
            imageBlob: lastServerRecognition.blob,
            correctionLatex: correctionInput ? correctionInput.value.trim() : '',
            problemType: problemType ? problemType.value : '',
            comment: commentInput ? commentInput.value.trim() : ''
        });

        const modalEl = document.getElementById('feedbackModal');
        if (modalEl) {
            const instance = bootstrap.Modal.getInstance(modalEl);
            if (instance) instance.hide();
        }
        showToast(data && data.feedback_id ? '反馈已提交，审核通过后发放补偿' : '反馈已提交');
        hideFeedbackButtons();
    } catch (error) {
        showAlert('反馈提交失败：' + (error.message || error));
    } finally {
        if (button) button.disabled = false;
    }
}

// ---- 账号、余额、兑换码 ----

function renderServerAuthState() {
    const loggedIn = typeof isServerLoggedIn === 'function' && isServerLoggedIn();

    const auth = document.getElementById('serverAuthPanel');
    const panel = document.getElementById('serverAccountPanel');
    if (auth) auth.style.display = loggedIn ? 'none' : '';
    if (panel) panel.style.display = loggedIn ? '' : 'none';

    if (!loggedIn) {
        // 退出登录后回到「登录」页签
        showServerAuthTab('login');
        return;
    }

    const user = typeof getServerUser === 'function' ? (getServerUser() || {}) : {};
    const accountLabel = document.getElementById('serverAccountLabel');
    if (accountLabel) {
        accountLabel.textContent = (typeof getServerAccount === 'function' && getServerAccount())
            || user.email || user.username || '-';
    }
    renderServerBalance(user.balance_points);
    renderServerLottery(user.lottery_chances);
}

function renderServerBalance(points) {
    const el = document.getElementById('serverBalanceLabel');
    if (!el) return;
    el.textContent = typeof points === 'number' ? formatPoints(points) : '-';
    el.classList.remove('text-muted');
}

// 抽奖次数为 undefined（旧版服务端无此字段）时只把标签置为「-」，
// 不动抽奖按钮的禁用状态，避免误禁用。
function renderServerLottery(chances) {
    const label = document.getElementById('serverLotteryLabel');
    const button = document.getElementById('serverDrawButton');
    if (label) {
        label.textContent = typeof chances === 'number' ? String(chances) : '-';
        if (typeof chances === 'number') label.classList.remove('text-muted');
    }
    if (button && typeof chances === 'number') button.disabled = chances < 1;
}

function renderServerModelOptions() {
    const select = document.getElementById('serverModelSelect');
    if (!select) return;

    const models = typeof getServerModelsFromCache === 'function' ? getServerModelsFromCache() : [];
    select.innerHTML = '';

    if (!models.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = (typeof isServerLoggedIn === 'function' && isServerLoggedIn())
            ? '（暂无可用模型）'
            : '（登录后加载）';
        option.disabled = true;
        select.appendChild(option);
        return;
    }

    models.forEach(function(model) {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.display_name || model.id;
        select.appendChild(option);
    });

    const saved = typeof getSelectedServerModelId === 'function' ? getSelectedServerModelId() : '';
    const hasSaved = saved && models.some(function(model) { return model.id === saved; });
    if (hasSaved) {
        select.value = saved;
    } else if (typeof saveSelectedServerModelId === 'function') {
        saveSelectedServerModelId(models[0].id);
    }
}

async function refreshServerModels() {
    if (typeof serviceFetchModels !== 'function') return;
    try {
        await serviceFetchModels();
        renderServerModelOptions();
    } catch (_) {
        // 拉不到就沿用缓存，不打扰用户
        renderServerModelOptions();
    }
}

let serverBalanceRefreshing = false;

async function refreshServerAccount() {
    if (typeof isServerLoggedIn !== 'function' || !isServerLoggedIn()) return;
    if (serverBalanceRefreshing) return;
    serverBalanceRefreshing = true;

    const label = document.getElementById('serverBalanceLabel');
    const lotteryLabel = document.getElementById('serverLotteryLabel');
    const button = document.getElementById('serverRefreshBalanceButton');
    const previous = label ? label.textContent : null;
    const previousLottery = lotteryLabel ? lotteryLabel.textContent : null;
    // 即时反馈：余额与抽奖次数先变「读取中…」，请求回来再替换成数字
    if (label) {
        label.textContent = '读取中…';
        label.classList.add('text-muted');
    }
    if (lotteryLabel) {
        lotteryLabel.textContent = '读取中…';
        lotteryLabel.classList.add('text-muted');
    }
    if (button) button.disabled = true;
    try {
        const user = await serviceFetchMe();
        renderServerAuthState();
        if (user && typeof user.balance_points === 'number') {
            renderServerBalance(user.balance_points);
        }
    } catch (_) {
        // 刷新失败恢复原值并提示，不阻塞识别
        if (label) {
            label.textContent = previous || '-';
            label.classList.remove('text-muted');
        }
        if (lotteryLabel) {
            lotteryLabel.textContent = previousLottery || '-';
            lotteryLabel.classList.remove('text-muted');
        }
        if (typeof showToast === 'function') showToast('账号信息刷新失败');
    } finally {
        if (button) button.disabled = false;
        serverBalanceRefreshing = false;
    }
}

async function serverLoginHandler() {
    const accountInput = document.getElementById('serverAccountInput');
    const passwordInput = document.getElementById('serverPasswordInput');
    const identifier = accountInput ? accountInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (typeof getServerBaseUrl !== 'function' || !getServerBaseUrl()) {
        return showAlert('请先填写并保存服务端地址');
    }
    if (!identifier || !password) {
        return showAlert('请输入账号和密码');
    }

    const button = document.getElementById('serverLoginButton');
    if (button) button.disabled = true;
    try {
        await serviceLogin(identifier, password);
        if (passwordInput) passwordInput.value = '';
        renderServerAuthState();
        await refreshServerModels();
        // 登录响应不带 lottery_chances，拉一次账号信息补上，次数标签才不是「-」
        refreshServerAccount();
        showToast('登录成功');
    } catch (error) {
        showAlert('登录失败：' + (error.message || error));
    } finally {
        if (button) button.disabled = false;
    }
}

async function serverLogoutHandler() {
    try {
        await serviceLogout();
    } catch (_) { /* 本地登出照常完成 */ }
    renderServerAuthState();
    hideFeedbackButtons();
    renderServerModelOptions();
    showToast('已退出登录');
}

// 用户中心：服务端账号页（安全设置 / 设备管理 / 账单明细在那边）
async function openUserCenterHandler() {
    if (typeof getServerBaseUrl !== 'function' || !getServerBaseUrl()) {
        return showAlert('请先填写并保存服务端地址');
    }
    const url = getServerBaseUrl() + '/account/';
    // 桌面版 pywebview 里 window.open 弹窗不可靠，交给本地后端用系统浏览器打开；
    // 网页版直接新开标签页。账号页有独立登录，与客户端的登录态互不相通。
    if (typeof isDesktopEnv === 'function' && isDesktopEnv()) {
        try {
            const resp = await fetch(window.LOCAL_API_BASE + '/api/open-external', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url })
            });
            if (!resp.ok) throw new Error('open failed');
            return;
        } catch (_) {
            return showAlert('无法打开系统浏览器，请手动访问：' + url);
        }
    }
    window.open(url, '_blank', 'noopener');
}

// ---- 登录 / 注册 / 忘记密码 三个页签 ----

const SERVER_AUTH_TABS = {
    login: { tab: 'serverTabLogin', pane: 'serverLoginPane' },
    register: { tab: 'serverTabRegister', pane: 'serverRegisterPane' },
    reset: { tab: 'serverTabReset', pane: 'serverResetPane' }
};

function showServerAuthTab(name) {
    const active = SERVER_AUTH_TABS[name] ? name : 'login';
    Object.keys(SERVER_AUTH_TABS).forEach(function(key) {
        const ids = SERVER_AUTH_TABS[key];
        const tab = document.getElementById(ids.tab);
        const pane = document.getElementById(ids.pane);
        if (tab) tab.classList.toggle('active', key === active);
        if (pane) pane.style.display = key === active ? '' : 'none';
    });
    if (active === 'register') serverApplyRegisterPolicy();
}

// 按服务端下发的注册要求，显示/隐藏邀请码与邮箱验证码两项
async function serverApplyRegisterPolicy() {
    if (typeof serviceFetchRegisterPolicy !== 'function') return;
    const policy = await serviceFetchRegisterPolicy();
    const inviteGroup = document.getElementById('serverRegInviteGroup');
    const codeGroup = document.getElementById('serverRegCodeGroup');
    if (inviteGroup) inviteGroup.style.display = policy.require_invite ? '' : 'none';
    if (codeGroup) codeGroup.style.display = policy.email_verification ? '' : 'none';
}

// 验证码按钮倒计时，避免撞上服务端的发送冷却
function startCountdown(button, seconds, idleText) {
    if (!button) return;
    let left = seconds;
    button.disabled = true;
    button.textContent = left + 's';
    const timer = setInterval(function() {
        left -= 1;
        if (left <= 0) {
            clearInterval(timer);
            button.disabled = false;
            button.textContent = idleText;
            return;
        }
        button.textContent = left + 's';
    }, 1000);
}

async function serverSendCodeHandler() {
    const emailInput = document.getElementById('serverRegEmail');
    const email = emailInput ? emailInput.value.trim() : '';
    if (!email) return showAlert('请先填写邮箱');

    const button = document.getElementById('serverSendCodeButton');
    if (button) button.disabled = true;
    try {
        await serviceSendEmailCode(email);
        showToast('验证码已发送，请查收邮件');
        startCountdown(button, 60, '获取验证码');
    } catch (error) {
        // 服务端未配置邮件：本就不需要验证码
        if (error && error.code === 'smtp_disabled') {
            showToast('该服务端无需邮箱验证');
        } else {
            showAlert('验证码发送失败：' + (error.message || error));
        }
        if (button) button.disabled = false;
    }
}

async function serverSendResetCodeHandler() {
    const emailInput = document.getElementById('serverResetEmail');
    const email = emailInput ? emailInput.value.trim() : '';
    if (!email) return showAlert('请先填写邮箱');

    const button = document.getElementById('serverSendResetCodeButton');
    if (button) button.disabled = true;
    try {
        await serviceSendResetCode(email);
        showToast('重置码已发送，请查收邮件');
        startCountdown(button, 60, '发送重置码');
    } catch (error) {
        if (error && error.code === 'smtp_disabled') {
            showAlert('该服务端未配置邮件，请联系管理员重置密码');
        } else {
            showAlert('重置码发送失败：' + (error.message || error));
        }
        if (button) button.disabled = false;
    }
}

async function serverRegisterHandler() {
    const emailInput = document.getElementById('serverRegEmail');
    const usernameInput = document.getElementById('serverRegUsername');
    const passwordInput = document.getElementById('serverRegPassword');
    const inviteInput = document.getElementById('serverRegInvite');
    const codeInput = document.getElementById('serverRegCode');

    const inviteGroup = document.getElementById('serverRegInviteGroup');
    const codeGroup = document.getElementById('serverRegCodeGroup');
    const inviteVisible = inviteGroup ? inviteGroup.style.display !== 'none' : true;
    const codeVisible = codeGroup ? codeGroup.style.display !== 'none' : false;

    const email = emailInput ? emailInput.value.trim() : '';
    const username = usernameInput ? usernameInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !username || !password) {
        return showAlert('请填写邮箱、用户名和密码');
    }

    const button = document.getElementById('serverRegisterButton');
    if (button) button.disabled = true;
    try {
        await serviceRegister({
            email: email,
            username: username,
            password: password,
            inviteCode: inviteVisible && inviteInput ? inviteInput.value.trim() : '',
            emailCode: codeVisible && codeInput ? codeInput.value.trim() : ''
        });
        // 服务端注册不签发令牌：注册成功后立即用同一组凭据登录
        await serviceLogin(email, password);
        if (passwordInput) passwordInput.value = '';
        renderServerAuthState();
        await refreshServerModels();
        refreshServerAccount();
        showToast('注册成功，已自动登录');
    } catch (error) {
        showAlert('注册失败：' + (error.message || error));
    } finally {
        if (button) button.disabled = false;
    }
}

async function serverResetHandler() {
    const emailInput = document.getElementById('serverResetEmail');
    const codeInput = document.getElementById('serverResetCode');
    const passwordInput = document.getElementById('serverResetPassword');

    const email = emailInput ? emailInput.value.trim() : '';
    const code = codeInput ? codeInput.value.trim() : '';
    const newPassword = passwordInput ? passwordInput.value : '';

    if (!email || !code || !newPassword) {
        return showAlert('请填写邮箱、验证码和新密码');
    }

    const button = document.getElementById('serverResetButton');
    if (button) button.disabled = true;
    try {
        await serviceResetPassword({ email: email, code: code, newPassword: newPassword });
        if (passwordInput) passwordInput.value = '';
        if (codeInput) codeInput.value = '';
        // 重置会吊销全部会话；这里本就未登录，切回登录页签并回填邮箱
        const accountInput = document.getElementById('serverAccountInput');
        if (accountInput) accountInput.value = email;
        showServerAuthTab('login');
        showToast('密码已重置，请用新密码登录');
    } catch (error) {
        showAlert('密码重置失败：' + (error.message || error));
    } finally {
        if (button) button.disabled = false;
    }
}

async function serverCheckinHandler() {
    if (typeof isServerLoggedIn !== 'function' || !isServerLoggedIn()) return;
    const button = document.getElementById('serverCheckinButton');
    if (button) button.disabled = true;
    try {
        const data = await serviceCheckIn();
        if (data.draw_granted) {
            showToast('签到成功，获得 1 次抽奖机会！');
        } else {
            showToast('签到成功，本次未获得抽奖机会');
        }
        renderServerBalance(data.balance_points);
        renderServerLottery(data.lottery_chances);
    } catch (error) {
        if (error && error.code === 'already_checked_in') {
            showToast('今天已经签到过了');
        } else if (error && error.code === 'checkin_disabled') {
            showToast('签到活动未开启');
        } else {
            showAlert('签到失败：' + (error.message || error));
        }
    } finally {
        if (button) button.disabled = false;
    }
}

async function serverDrawHandler() {
    if (typeof isServerLoggedIn !== 'function' || !isServerLoggedIn()) return;
    const button = document.getElementById('serverDrawButton');
    if (button) button.disabled = true;
    try {
        const data = await serviceDrawLottery();
        showToast('恭喜！抽中 ' + formatPoints(data.granted_points) + ' 积分');
        renderServerBalance(data.balance_points);
        renderServerLottery(data.lottery_chances);
    } catch (error) {
        if (error && error.code === 'no_draws') {
            showToast('没有可用的抽奖次数，先去签到吧');
            refreshServerAccount();
        } else if (error && error.code === 'lottery_disabled') {
            showToast('抽奖活动未开启');
        } else {
            showAlert('抽奖失败：' + (error.message || error));
        }
    } finally {
        // 无论成败都按最新次数恢复状态：次数已知为 0 时保持禁用，
        // 未知（旧版服务端）或大于 0 时恢复可点击
        const user = typeof getServerUser === 'function' ? (getServerUser() || {}) : {};
        const chances = typeof user.lottery_chances === 'number' ? user.lottery_chances : undefined;
        renderServerLottery(chances);
        if (button) button.disabled = chances === 0;
    }
}

async function redeemCode() {
    const input = document.getElementById('serverRedeemInput');
    const code = input ? input.value.trim() : '';

    if (typeof isServerLoggedIn !== 'function' || !isServerLoggedIn()) {
        return showAlert('请先登录服务端账号');
    }
    if (!code) {
        return showAlert('请输入兑换码');
    }

    const button = document.getElementById('serverRedeemButton');
    if (button) button.disabled = true;
    try {
        const data = await serviceRedeemCode(code);
        if (input) input.value = '';
        renderServerBalance(data.balance_points);
        showToast('兑换成功，获得 ' + formatPoints(data.granted_points) + ' 积分');
    } catch (error) {
        showAlert('兑换失败：' + (error.message || error));
    } finally {
        if (button) button.disabled = false;
    }
}

// ---- 公告 ----

async function loadAnnouncements() {
    const bar = document.getElementById('announcementBar');
    if (!bar || typeof serviceFetchAnnouncements !== 'function') return;

    let items = [];
    try {
        items = await serviceFetchAnnouncements(1);
    } catch (_) { return; }

    const latest = items && items[0];
    if (!latest) {
        bar.style.display = 'none';
        return;
    }

    const titleEl = document.getElementById('announcementTitle');
    const contentEl = document.getElementById('announcementContent');
    // 公告是外部文本，按纯文本写入，避免注入 HTML
    if (titleEl) titleEl.textContent = latest.title ? latest.title + '：' : '';
    if (contentEl) contentEl.textContent = latest.content || '';
    bar.style.display = '';
}

// ---- 设置弹窗里的服务端区块 ----

function updateServerRegisterLink() {
    const link = document.getElementById('serverRegisterLink');
    if (!link) return;
    const base = typeof getServerBaseUrl === 'function' ? getServerBaseUrl() : '';
    link.href = base ? base + '/account/register' : '#';
}

function initServerSettingsUI() {
    const baseInput = document.getElementById('serverBaseUrlInput');
    if (baseInput) baseInput.value = typeof getServerBaseUrl === 'function' ? getServerBaseUrl() : '';

    updateServerRegisterLink();
    renderServerAuthState();
    renderServerModelOptions();

    const saveButton = document.getElementById('saveServerBaseUrlButton');
    if (saveButton) {
        saveButton.addEventListener('click', function() {
            const saved = setServerBaseUrl(baseInput ? baseInput.value : '');
            if (baseInput) baseInput.value = saved;
            updateServerRegisterLink();
            showToast('服务端地址已保存');
            if (typeof isServerLoggedIn === 'function' && isServerLoggedIn()) {
                refreshServerModels();
            }
        });
    }

    const loginButton = document.getElementById('serverLoginButton');
    if (loginButton) loginButton.addEventListener('click', serverLoginHandler);

    const logoutButton = document.getElementById('serverLogoutButton');
    if (logoutButton) logoutButton.addEventListener('click', serverLogoutHandler);

    // 登录 / 注册 / 忘记密码 页签
    const tabLogin = document.getElementById('serverTabLogin');
    if (tabLogin) tabLogin.addEventListener('click', function() { showServerAuthTab('login'); });
    const tabRegister = document.getElementById('serverTabRegister');
    if (tabRegister) tabRegister.addEventListener('click', function() { showServerAuthTab('register'); });
    const tabReset = document.getElementById('serverTabReset');
    if (tabReset) tabReset.addEventListener('click', function() { showServerAuthTab('reset'); });

    const sendCodeButton = document.getElementById('serverSendCodeButton');
    if (sendCodeButton) sendCodeButton.addEventListener('click', serverSendCodeHandler);

    const sendResetCodeButton = document.getElementById('serverSendResetCodeButton');
    if (sendResetCodeButton) sendResetCodeButton.addEventListener('click', serverSendResetCodeHandler);

    const registerButton = document.getElementById('serverRegisterButton');
    if (registerButton) registerButton.addEventListener('click', serverRegisterHandler);

    const resetButton = document.getElementById('serverResetButton');
    if (resetButton) resetButton.addEventListener('click', serverResetHandler);

    const refreshButton = document.getElementById('serverRefreshBalanceButton');
    const checkinButton = document.getElementById('serverCheckinButton');
    if (checkinButton) checkinButton.addEventListener('click', serverCheckinHandler);
    const drawButton = document.getElementById('serverDrawButton');
    if (drawButton) drawButton.addEventListener('click', serverDrawHandler);
    if (refreshButton) refreshButton.addEventListener('click', refreshServerAccount);
    const userCenterButton = document.getElementById('serverUserCenterButton');
    if (userCenterButton) userCenterButton.addEventListener('click', openUserCenterHandler);

    const redeemButton = document.getElementById('serverRedeemButton');
    if (redeemButton) redeemButton.addEventListener('click', redeemCode);

    const modelSelect = document.getElementById('serverModelSelect');
    if (modelSelect) {
        modelSelect.addEventListener('change', function() {
            saveSelectedServerModelId(this.value);
        });
    }

    // 打开设置弹窗时若已登录，顺手刷新账号信息（余额+抽奖）与模型
    const modalEl = document.getElementById('settingsModal');
    if (modalEl) {
        modalEl.addEventListener('shown.bs.modal', function() {
            if (typeof isServerLoggedIn === 'function' && isServerLoggedIn()) {
                refreshServerAccount();
                refreshServerModels();
            }
        });
    }
}

// ---- 公式字号 ----
const FORMULA_FONT_KEY = 'formulaFontSize';
const FORMULA_AUTOFIT_KEY = 'formulaAutoFit';
const FORMULA_FONT_DEFAULT = 28;
const FORMULA_FONT_MIN = 12;
const FORMULA_FONT_MAX = 96; // 需与 index.html 里滑块的 min/max 保持一致

function getFormulaFontSize() {
    const saved = parseInt(localStorage.getItem(FORMULA_FONT_KEY), 10);
    return Number.isFinite(saved) ? saved : FORMULA_FONT_DEFAULT;
}

function isFormulaAutoFit() {
    const saved = localStorage.getItem(FORMULA_AUTOFIT_KEY);
    return saved === null ? true : saved === 'true';
}

// 按预览区可用空间算字号：宽、高两个方向都要装得下，取更严格的那个。
// 公式比预览区小时同样会放大，上下限由滑块范围界定。
function computeFittedFontSize(display, reference) {
    const math = display.querySelector('math');
    if (!math) return null;

    const style = getComputedStyle(display);
    const availWidth = display.clientWidth
        - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availHeight = display.clientHeight
        - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (availWidth <= 0 || availHeight <= 0) return null;

    // <math> 的宽度是 100%，量出来永远是预览区宽度，得让它先收缩到内容宽度。
    // 用 max-content 而不是取内层 <mrow>：像 x^2 这种简单公式 Temml 不会生成
    // 顶层 <mrow>（直接就是 <msup>），只有 max-content 对两种结构都成立。
    const previousWidth = math.style.width;
    math.style.width = 'max-content';
    const rect = math.getBoundingClientRect();
    const naturalWidth = rect.width;
    const naturalHeight = rect.height;
    math.style.width = previousWidth;

    if (!naturalWidth || !naturalHeight) return null;

    // 调用方已把字号重置为 reference，量到的始终是未缩放尺寸，结果才稳定
    const ratio = Math.min(availWidth / naturalWidth, availHeight / naturalHeight);
    const size = Math.floor(reference * ratio);
    return Math.min(FORMULA_FONT_MAX, Math.max(FORMULA_FONT_MIN, size));
}

// 自适应开启时滑块禁用，只负责显示当前生效的字号
function setFontSizeControl(size, autoFit) {
    const slider = document.getElementById('formulaFontSize');
    const valueLabel = document.getElementById('formulaFontSizeValue');
    if (slider) {
        slider.disabled = autoFit;
        slider.value = String(size);
        slider.title = autoFit ? '已开启自动适应，字号由公式大小和预览区共同决定' : '';
    }
    if (valueLabel) valueLabel.textContent = size + 'px';
}

function applyFormulaFontSize() {
    const display = document.getElementById('formulaDisplay');
    if (!display) return;

    const preferred = getFormulaFontSize();
    const autoFit = isFormulaAutoFit();

    // 先按基准字号渲染，自适应才有东西可测量
    display.style.fontSize = preferred + 'px';

    const size = autoFit
        ? (computeFittedFontSize(display, preferred) || preferred)
        : preferred;

    display.style.fontSize = size + 'px';
    setFontSizeControl(size, autoFit);
}

function initFormulaFontSizeSettings() {
    const slider = document.getElementById('formulaFontSize');
    const autoFit = document.getElementById('formulaAutoFit');
    if (!slider || !autoFit) return;

    slider.value = String(getFormulaFontSize());
    autoFit.checked = isFormulaAutoFit();

    slider.addEventListener('input', function() {
        localStorage.setItem(FORMULA_FONT_KEY, this.value);
        applyFormulaFontSize();
    });

    autoFit.addEventListener('change', function() {
        localStorage.setItem(FORMULA_AUTOFIT_KEY, this.checked ? 'true' : 'false');
        // 关闭自适应时 applyFormulaFontSize 会把滑块还原成用户设定的字号
        applyFormulaFontSize();
    });

    // 预览区尺寸随窗口变化，自适应要跟着重算
    window.addEventListener('resize', applyFormulaFontSize);
}

// 渲染LaTeX
function renderLaTeX() {
    const latexInput = document.getElementById('latexInput').value;
    const formulaDisplay = document.getElementById('formulaDisplay');

    // 清空之前的渲染
    formulaDisplay.innerHTML = '';

    try {
        // 使用 temml.js 渲染 LaTeX
        const html = temml.renderToString(latexInput, {
            displayMode: true,
            MathFont: 'Latin-Modern',
            throwOnError: false
        });

        // 将渲染结果插入到公式显示区域
        formulaDisplay.innerHTML = html;
    } catch (error) {
        formulaDisplay.innerHTML = `<div class="text-danger">渲染错误: ${error.message}</div>`;
    }

    // 渲染完再调字号：自适应需要先有内容才能测量
    applyFormulaFontSize();
}

// 复制LaTeX
function copyLaTeX() {
    const latexInput = document.getElementById('latexInput').value;
    if (latexInput) {
        navigator.clipboard.writeText(latexInput).then(() => {
            // 保存到历史记录
            saveToHistory(latexInput);
            // 显示toast
            showToast('LaTeX已复制到剪贴板');
        }).catch(err => {
            console.error('复制失败:', err);
            showAlert('复制失败，请检查您的浏览器设置');
        });
    } else {
        showAlert('没有LaTeX内容可复制');
    }
}

// 复制MathML
function copyMathML() {
    const latexInput = document.getElementById('latexInput').value;
    if (latexInput) {
        try {
            // 使用temml.js将LaTeX转换为MathML
            const mathML = temml.renderToString(latexInput, {
                displayMode: true,
                annotate: true,
                xml: true,
                MathFont: 'Latin-Modern',
                OutputType: 'Flat MML',
            });

            navigator.clipboard.writeText(mathML).then(() => {
                // 保存到历史记录
                saveToHistory(latexInput);
                // 显示toast
                showToast('MathML已复制到剪贴板');
            }).catch(err => {
                console.error('复制失败:', err);
                showAlert('复制失败，请检查您的浏览器设置');
            });
        } catch (error) {
            console.error('转换失败:', error);
            showAlert('无法转换为MathML，请检查LaTeX代码');
        }
    } else {
        showAlert('没有LaTeX内容可转换');
    }
}

function showAlert(message) {
    const alertContainer = document.getElementById('alertContainer');
    const alertMessage = document.getElementById('alertMessage');

    alertMessage.textContent = message;
    alertContainer.style.display = 'block';

    // 自动关闭 alert（3 秒后）
    setTimeout(() => {
        alertContainer.style.display = 'none';
    }, 3000);
}

// 显示toast
function showToast(message) {
    const toastBody = document.getElementById('toastBody');
    const toast = new bootstrap.Toast(document.getElementById('copyToast'));

    // 设置toast内容
    toastBody.textContent = message;

    // 显示toast
    toast.show();

    // 设置自动关闭时间（1秒后关闭）
    setTimeout(() => {
        toast.hide();
    }, 1000);
}

// 显示加载动画
function showLoading(message) {
    isLoading = true;
    const messageEl = document.getElementById('loadingMessage');
    if (messageEl) {
        messageEl.textContent = message || '';
        messageEl.style.display = message ? 'block' : 'none';
    }
    document.getElementById('loadingOverlay').style.display = 'flex';
}

// 更新历史记录UI
function updateHistoryUI() {
    const historyListElement = document.getElementById('historyList');
    if (!historyListElement) return;
    
    // 清空历史记录列表
    historyListElement.innerHTML = '';
    
    // 检查是否有历史记录
    if (historyList.length === 0) {
        const emptyItem = document.createElement('li');
        emptyItem.className = 'list-group-item history-empty';
        emptyItem.textContent = '暂无历史记录';
        historyListElement.appendChild(emptyItem);
        return;
    }
    
    // 添加每个历史记录项
    historyList.forEach((item, index) => {
        const listItem = document.createElement('li');
        listItem.className = 'list-group-item';
        listItem.style.cursor = 'pointer';
        listItem.style.position = 'relative';
        listItem.title = `点击恢复此公式\n代码: ${item.code}`;
        
        // 添加渲染的LaTeX公式
        const formulaContainer = document.createElement('div');
        formulaContainer.className = 'history-formula';
        formulaContainer.setAttribute('data-latex', item.code);
        
        try {
            // 使用temml.js渲染LaTeX
            const html = temml.renderToString(item.code, {
                displayMode: true,
                MathFont: 'Latin-Modern',
                throwOnError: false
            });
            formulaContainer.innerHTML = html;
        } catch (error) {
            formulaContainer.textContent = item.code;
            formulaContainer.className = 'text-danger';
        }
        
        // 添加删除按钮
        const deleteButton = document.createElement('button');
        deleteButton.className = 'btn btn-danger btn-sm';
        deleteButton.textContent = '×';
        deleteButton.style.fontSize = '1.2rem';
        deleteButton.style.lineHeight = '1';
        deleteButton.style.padding = '0.25rem 0.5rem';
        deleteButton.style.minWidth = '30px'; /* 设置最小宽度 */
        deleteButton.style.height = '30px'; /* 设置固定高度 */
        deleteButton.style.display = 'flex'; /* 使用flex布局 */
        deleteButton.style.alignItems = 'center'; /* 垂直居中 */
        deleteButton.style.justifyContent = 'center'; /* 水平居中 */
        deleteButton.title = '删除此历史记录';
        deleteButton.onclick = (e) => {
            e.stopPropagation(); // 阻止事件冒泡
            deleteHistoryItem(index);
        };

        // 添加展开按钮
        const expandButton = document.createElement('button');
        expandButton.className = 'btn btn-sm btn-outline-secondary';
        expandButton.textContent = '▼';
        expandButton.style.fontSize = '0.7rem';
        expandButton.style.padding = '0.25rem 0.5rem';
        expandButton.style.minWidth = '30px';
        expandButton.style.height = '30px';
        expandButton.style.display = 'flex';
        expandButton.style.alignItems = 'center';
        expandButton.style.justifyContent = 'center';
        expandButton.title = '展开/收起公式';
        expandButton.onclick = (e) => {
            e.stopPropagation();
            listItem.classList.toggle('expanded');
            expandButton.textContent = listItem.classList.contains('expanded') ? '▲' : '▼';
        };

        // 添加按钮容器
        const buttonGroup = document.createElement('div');
        buttonGroup.style.display = 'flex';
        buttonGroup.style.gap = '4px';
        buttonGroup.style.flexShrink = '0';
        buttonGroup.style.alignSelf = 'center';
        buttonGroup.appendChild(expandButton);
        buttonGroup.appendChild(deleteButton);
        
        // 将公式和按钮添加到列表项
        listItem.appendChild(formulaContainer);
        listItem.appendChild(buttonGroup);
        
        // 添加点击事件，用于恢复公式
        listItem.onclick = () => {
            restoreFromHistory(item.code);
        };
        
        // 添加到历史记录列表
        historyListElement.appendChild(listItem);
    });
}

// 从历史记录中删除项
function deleteHistoryItem(index) {
    historyList.splice(index, 1);
    localStorage.setItem('latexHistory', JSON.stringify(historyList));
    updateHistoryUI();
}

// 从历史记录中恢复公式
function restoreFromHistory(latexCode) {
    document.getElementById('latexInput').value = latexCode;
    renderLaTeX();
    showToast('已从历史记录恢复公式');
}

// 隐藏加载动画
function hideLoading() {
    isLoading = false;
    document.getElementById('loadingOverlay').style.display = 'none';
}

// 打开公式预览弹窗
function openPreviewModal() {
    const latexInput = document.getElementById('latexInput').value;
    const previewEl = document.getElementById('formulaPreviewFullscreen');
    previewEl.innerHTML = '';
    try {
        const html = temml.renderToString(latexInput, {
            displayMode: true,
            MathFont: 'Latin-Modern',
            throwOnError: false
        });
        previewEl.innerHTML = html;
    } catch (error) {
        previewEl.innerHTML = `<div class="text-danger">渲染错误: ${error.message}</div>`;
    }
    document.getElementById('previewModal').style.display = 'flex';
}

// 关闭公式预览弹窗
function closePreviewModal() {
    document.getElementById('previewModal').style.display = 'none';
}