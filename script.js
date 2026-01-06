// 全局变量，用于跟踪是否正在加载
let isLoading = false;

// 历史记录数组，用于存储最近复制的LaTeX代码
let historyList = [];
// 历史记录最大数量
const MAX_HISTORY_ITEMS = 20;

document.addEventListener('DOMContentLoaded', function() {
    // 从本地存储加载历史记录
    loadHistory();
    
    // 更新历史记录UI
    updateHistoryUI();

    // 监听粘贴事件
    document.addEventListener('paste', handlePaste);

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

    // 初始化模型选择下拉框
    if (typeof generateModelOptions === 'function') {
        generateModelOptions();
    }
    
    // 监听模型选择变化
    document.getElementById('modelSelect').addEventListener('change', function() {
        if (typeof saveSelectedModel === 'function') {
            saveSelectedModel(this.value);
        }
    });

    // 初始化Temml渲染
    renderLaTeX();

    // 尝试从本地存储加载API密钥
    loadApiKey();
});

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

// 保存API密钥
function saveApiKey() {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const apiKey = apiKeyInput.value.trim();

    if (apiKey) {
        localStorage.setItem('apiKey', apiKey);
        showAlert('API密钥已保存！');
    } else {
        showAlert('请输入有效的API密钥');
    }
}

// 加载API密钥
function loadApiKey() {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const savedApiKey = localStorage.getItem('apiKey');

    if (savedApiKey) {
        apiKeyInput.value = savedApiKey;
    }
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

// 处理文件选择
function handleFileSelect(e) {
    if (isLoading) {
        return; // 如果正在加载，直接返回
    }

    const file = e.target.files[0];
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

        // 显示图片预览
        const imagePreview = document.getElementById('imagePreview');
        imagePreview.innerHTML = `<img src="${event.target.result}" class="img-fluid">`;

        // 调用自定义API
        callCustomAPI(base64Data);
    };

    reader.readAsDataURL(file);
}

// 调用自定义API
async function callCustomAPI(base64Data) {
    try {
        // 检查网络连接
        if (!navigator.onLine) {
            hideLoading(); // 隐藏加载动画
            showAlert('当前无网络连接，请检查您的网络设置。');
            return;
        }

        // 获取API密钥
        const apiKey = document.getElementById('apiKeyInput').value.trim();
        if (!apiKey) {
            hideLoading(); // 隐藏加载动画
            showAlert('请输入有效的API密钥');
            return;
        }

        // 获取模型选择器
        const modelSelect = document.getElementById('modelSelect');
        const modelName = modelConfig[modelSelect.value].name;
        const url = "https://api.siliconflow.cn/v1/chat/completions";
        const prompts = "请把图中的公式转成LaTeX格式，不要输出任何额外内容。";

        const response = await fetch(url, {
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

        if (!response.ok) {
            hideLoading(); // 隐藏加载动画
            throw new Error(`API调用失败，状态码: ${response.status}`);
        }

        const data = await response.json();

        if (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
            hideLoading(); // 隐藏加载动画

            // 获取LaTeX代码
            let latexCode = data.choices[0].message.content;

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

            if (data.usage && data.usage.total_tokens) {
                document.getElementById('tokenCountDisplay').textContent = data.usage.total_tokens;
            }

        } else {
            hideLoading(); // 隐藏加载动画
            showAlert('无法提取LaTeX代码，请尝试其他图片。');
        }
    } catch (error) {
        console.error('Error:', error);
        hideLoading(); // 隐藏加载动画
        if (error.message.includes('Failed to fetch')) {
            showAlert('API链接解析失败，请检查链接的合法性和网络连接。');
        } else {
            showAlert('API调用失败，请检查网络连接或API密钥。');
        }
    }
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
function showLoading() {
    isLoading = true;
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
        
        // 将公式和删除按钮添加到列表项
        listItem.appendChild(formulaContainer);
        listItem.appendChild(deleteButton);
        
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