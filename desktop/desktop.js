/* ==========================================================================
   LaTeX 公式助手 —— 桌面版布局逻辑（Desktop-only）

   本文件只由桌面版加载（backend/server.py 注入）。职责仅限于"布局外壳"：
     1. 把两行布局骨架搬进正文容器，隐藏被搬空的原始行
     2. 把共用元素按 id 填进骨架的各 slot（上传 / LaTeX / 预览）
     3. 把共用的历史记录卡片搬进侧边栏
     4. 把"清空历史"按钮并到侧边栏标题行
     5. 把"主题切换"与"⚙ 设置"按钮从页头搬进侧边栏标题行（设置本体是共用弹窗）
     6. 侧边栏折叠 / 展开（含状态记忆）
     7. 使用说明弹窗（正文从共用页面的说明卡片克隆）

   注意：本文件不定义任何全局函数，也不修改 script.js 的共用逻辑。
   script.js 只做一件事：派发 'app:ready' 事件；桌面版在这里接管外壳。
   共用逻辑（识别、渲染、历史读写）两个版本完全同源。
   搬动 DOM 节点不会丢事件监听（只有重新解析 HTML 才会丢），
   而 script.js 全程用 getElementById 取元素，因此搬动后照常工作。
   ========================================================================== */
(function () {
    'use strict';

    var SIDEBAR_STATE_KEY = 'historySidebarCollapsed';

    function slot(name) {
        return document.querySelector('#desktopLayout [data-slot="' + name + '"]');
    }

    function moveInto(target, el) {
        if (target && el) target.appendChild(el);
    }

    // 搬动前先把所有要用的节点找齐：一旦开始搬，closest() 的结果会变
    function collectParts() {
        var imageUpload = document.getElementById('imageUpload');
        var latexInput = document.getElementById('latexInput');
        var openPreview = document.getElementById('openPreviewModal');
        var copyLatex = document.getElementById('copyLaTeXButton');
        var tokenCount = document.getElementById('tokenCountDisplay');
        var formulaDisplay = document.getElementById('formulaDisplay');
        var fontSizeSlider = document.getElementById('formulaFontSize');
        var historyList = document.getElementById('historyList');

        return {
            uploadCard: imageUpload && imageUpload.closest('.card'),
            latexLabel: document.querySelector('label[for="latexInput"]'),
            latexInput: latexInput,
            // 原来那一行"公式预览 + ⛶ 按钮"整体当卡片标题用（网页版已是 card-header）
            previewHeaderRow: openPreview && openPreview.parentElement,
            formulaDisplay: formulaDisplay,
            copyRow: copyLatex && copyLatex.closest('.row'),
            tokensRow: tokenCount && tokenCount.closest('.mt-3'),
            // 字号设置行：预览卡片内部第一行（须在搬动前记录，搬后 closest 失效）
            fontSizeRow: fontSizeSlider && fontSizeSlider.closest('.font-size-row'),
            // 这些"原始行"搬空后要藏掉，否则残留外边距占高度。
            // 设置已挪进共用弹窗，主行以图片上传卡为锚点；
            // 网页版预览独占第二行，搬空后同样要藏（须在搬动前收集）。
            mainRow: imageUpload && imageUpload.closest('.row'),
            previewRow: formulaDisplay && formulaDisplay.closest('.row'),
            historyRow: historyList && historyList.closest('.row')
        };
    }

    // 把骨架搬进正文容器（紧随被隐藏的原始行之前），并填入共用元素
    function buildLayout(parts) {
        var layout = document.getElementById('desktopLayout');
        if (!layout || !parts.mainRow) return;

        parts.mainRow.parentNode.insertBefore(layout, parts.mainRow);

        // 第一行：左 图片上传 / 右 LaTeX 代码（label 当卡片标题）
        moveInto(slot('upload'), parts.uploadCard);
        moveInto(slot('latex-header'), parts.latexLabel);
        moveInto(slot('latex-body'), parts.latexInput);

        // 第二行：公式预览（标题行 / 预览区 / 复制按钮 / Tokens）。
        // 网页版的预览标题行本身就是 card-header：整块替换骨架里的空 header，
        // 直接搬入会造成 card-header 套 card-header 的双层底色；
        // 万一来源结构变了（不是 card-header），退回普通搬入。
        var previewHeaderSlot = slot('preview-header');
        if (previewHeaderSlot && parts.previewHeaderRow) {
            if (parts.previewHeaderRow.classList.contains('card-header')) {
                parts.previewHeaderRow.setAttribute('data-slot', 'preview-header');
                previewHeaderSlot.parentNode.replaceChild(parts.previewHeaderRow, previewHeaderSlot);
            } else {
                previewHeaderSlot.appendChild(parts.previewHeaderRow);
            }
        }
        moveInto(slot('preview-body'), parts.fontSizeRow);
        moveInto(slot('preview-body'), parts.formulaDisplay);
        moveInto(slot('preview-body'), parts.copyRow);
        moveInto(slot('preview-body'), parts.tokensRow);

        // 被搬空的原始行不再占位；网页版预览独占第二行，搬空后同样要藏
        parts.mainRow.classList.add('dl-source-row');
        if (parts.previewRow && parts.previewRow !== parts.mainRow) {
            parts.previewRow.classList.add('dl-source-row');
        }
        if (parts.historyRow) parts.historyRow.classList.add('dl-source-row');
    }

    // 把 DOM 挪进侧边栏。共用逻辑持有的是 id 引用（不是位置），
    // 且监听器绑在 document/delegate 层，搬动后一切照常工作。
    function moveHistoryIntoSidebar() {
        var card = document.getElementById('historyList');
        card = card ? card.closest('.history-container') : null;
        var slot = document.getElementById('historySidebarSlot');
        if (card && slot) {
            slot.appendChild(card);
        }
    }

    // 把"清空历史"从小卡片的标题行挪到侧边栏标题行。
    // 只搬节点、不新建按钮：script.js 已按 id 绑好 click 监听，
    // 移动节点不会丢监听（只有重新解析 HTML 才会丢）。
    function moveClearButtonIntoHeader() {
        var button = document.getElementById('clearHistoryButton');
        var header = document.querySelector('.history-sidebar .sidebar-header');
        var sidebar = document.getElementById('historySidebar');
        if (!button || !header || !sidebar) return;

        header.appendChild(button);

        // 搬成功后才打标记：desktop.css 只在这个类存在时隐藏卡片的标题行。
        // 万一上面没搬成，标题行会留着，用户不会连"清空历史"入口一起失去。
        sidebar.classList.add('clear-btn-moved');
    }

    // 把共用的"主题切换"与"⚙ 设置"按钮从页头搬进侧边栏标题行（☰ 与 ？ 之间）。
    // 打开弹窗的 click 监听由 script.js 绑定，搬节点不丢监听；
    // 页头本身被 desktop.css 隐藏，按钮搬出来后才重新可见（不会闪）。
    // 先搬设置、再把主题插到设置前面，最终顺序：☰ 主题 设置 ？。
    function moveSettingsButtonIntoHeader() {
        var header = document.querySelector('.history-sidebar .sidebar-header');
        if (!header) return;

        var settings = document.getElementById('openSettingsButton');
        if (settings) {
            header.insertBefore(settings, document.getElementById('openInstructionsButton') || null);
        }

        var theme = document.getElementById('themeToggleButton');
        if (theme) {
            header.insertBefore(theme, settings && settings.parentNode === header ? settings : null);
        }
    }

    function applySidebarState(sidebar, toggleButton, collapsed) {
        sidebar.classList.toggle('collapsed', collapsed);
        toggleButton.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        toggleButton.title = collapsed ? '展开历史记录侧边栏' : '折叠历史记录侧边栏';
    }

    function initSidebar() {
        var sidebar = document.getElementById('historySidebar');
        var toggleButton = document.getElementById('toggleHistorySidebar');
        if (!sidebar || !toggleButton) return;

        var collapsed = false;
        try {
            collapsed = localStorage.getItem(SIDEBAR_STATE_KEY) === '1';
        } catch (_) { /* 读不到就用默认展开 */ }

        applySidebarState(sidebar, toggleButton, collapsed);

        toggleButton.addEventListener('click', function () {
            var next = !sidebar.classList.contains('collapsed');
            applySidebarState(sidebar, toggleButton, next);
            try {
                localStorage.setItem(SIDEBAR_STATE_KEY, next ? '1' : '0');
            } catch (_) { /* 写不进去也不影响本次使用 */ }
        });
    }

    function initInstructionsModal() {
        var modal = document.getElementById('instructionsModal');
        var card = document.getElementById('instructionsCard');
        if (!modal || !card) return;

        // 从共用页面的卡片克隆正文，说明文案只维护一份
        var body = modal.querySelector('.modal-body');
        var source = card.querySelector('.card-body');
        if (body && source) {
            body.innerHTML = source.innerHTML;
        }

        var openButton = document.getElementById('openInstructionsButton');
        if (openButton) {
            openButton.addEventListener('click', function () {
                new bootstrap.Modal(modal).show();
            });
        }
    }

    function formatBytes(bytes) {
        var value = Number(bytes) || 0;
        if (value < 1024) return value + ' B';
        var units = ['KB', 'MB', 'GB', 'TB'];
        var unit = -1;
        do {
            value /= 1024;
            unit += 1;
        } while (value >= 1024 && unit < units.length - 1);
        return value.toFixed(value >= 100 ? 0 : 1) + ' ' + units[unit];
    }

    function escapeHtml(value) {
        var holder = document.createElement('div');
        holder.textContent = String(value == null ? '' : value);
        return holder.innerHTML;
    }

    function initModelManager() {
        var modalEl = document.getElementById('modelManagerModal');
        var openButton = document.getElementById('openModelManagerButton');
        var list = document.getElementById('modelManagerList');
        var summary = document.getElementById('modelManagerSummary');
        var pathInput = document.getElementById('modelManagerPath');
        var status = document.getElementById('modelManagerStatus');
        var refreshButton = document.getElementById('refreshModelManagerButton');
        var openDirectoryButton = document.getElementById('openModelsDirectoryButton');
        if (!modalEl || !openButton || !list || !summary || !pathInput || !status) return;

        var managerModal = bootstrap.Modal.getOrCreateInstance(modalEl);
        var returnToSettings = false;
        var busy = false;

        function showStatus(message, type) {
            if (!message) {
                status.hidden = true;
                status.textContent = '';
                return;
            }
            status.className = 'alert alert-' + (type || 'secondary') + ' py-2 mb-3';
            status.textContent = message;
            status.hidden = false;
        }

        function setBusy(next) {
            busy = next;
            modalEl.querySelectorAll('[data-model-action], #refreshModelManagerButton, [data-model-manager-close]').forEach(function (el) {
                el.disabled = next;
            });
        }

        function progressBox(modelName) {
            var boxes = list.querySelectorAll('[data-progress-model]');
            for (var i = 0; i < boxes.length; i += 1) {
                if (boxes[i].getAttribute('data-progress-model') === modelName) return boxes[i];
            }
            return null;
        }

        function updateProgress(modelName, data) {
            var box = progressBox(modelName);
            if (!box) return;
            box.hidden = false;
            var bar = box.querySelector('.progress-bar');
            var text = box.querySelector('.model-progress-text');
            var percent = Math.max(0, Math.min(100, Number(data.percent) || 0));
            if (bar) {
                bar.style.width = percent + '%';
                bar.setAttribute('aria-valuenow', String(percent));
            }
            if (text) {
                if (!data.downloaded) {
                    text.textContent = '正在连接下载源…';
                } else {
                    text.textContent = percent + '% · ' + formatBytes(data.downloaded) + ' / ' + formatBytes(data.total);
                }
            }
        }

        function renderModels(data) {
            var models = Array.isArray(data.models) ? data.models : [];
            var installedCount = models.filter(function (model) { return model.downloaded; }).length;
            pathInput.value = data.directory || '';
            summary.textContent = installedCount + ' / ' + models.length + ' 个模型已安装 · 当前占用 ' + formatBytes(data.totalBytes);

            if (!models.length) {
                list.innerHTML = '<div class="text-body-secondary text-center py-4">当前没有可管理的本地模型。</div>';
                return;
            }

            list.innerHTML = models.map(function (model) {
                var installedBytes = Number(model.installedBytes) || 0;
                var stateText = model.downloaded ? '已安装' : (installedBytes ? '文件不完整' : '未安装');
                var stateClass = model.downloaded ? 'text-bg-success' : (installedBytes ? 'text-bg-warning' : 'text-bg-secondary');
                var name = escapeHtml(model.name);
                var actions;
                if (model.downloaded) {
                    actions =
                        '<button type="button" class="btn btn-sm btn-outline-primary" data-model-action="redownload" data-model-name="' + name + '">重新下载</button>' +
                        '<button type="button" class="btn btn-sm btn-outline-danger" data-model-action="delete" data-model-name="' + name + '">删除</button>';
                } else {
                    actions = '<button type="button" class="btn btn-sm btn-primary" data-model-action="download" data-model-name="' + name + '">' +
                        (installedBytes ? '继续下载' : '下载') + '</button>';
                }

                return '<section class="model-manager-item">' +
                    '<div class="model-manager-title-row">' +
                        '<div class="min-w-0">' +
                            '<div class="fw-semibold">' + escapeHtml(model.displayName || model.name) + '</div>' +
                            '<div class="small text-body-secondary mt-1">标识：' + name + '</div>' +
                        '</div>' +
                        '<span class="badge ' + stateClass + '">' + stateText + '</span>' +
                    '</div>' +
                    '<div class="small mt-3">' +
                        '模型大小：' + formatBytes(model.sizeBytes) +
                        (installedBytes ? ' · 当前占用：' + formatBytes(installedBytes) : '') +
                    '</div>' +
                    '<div class="model-download-progress mt-3" data-progress-model="' + name + '" hidden>' +
                        '<div class="d-flex justify-content-between small mb-1"><span>下载进度</span><span class="model-progress-text">准备下载…</span></div>' +
                        '<div class="progress" role="progressbar" aria-label="模型下载进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
                            '<div class="progress-bar progress-bar-striped progress-bar-animated" style="width: 0%"></div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="model-manager-actions mt-3">' + actions + '</div>' +
                '</section>';
            }).join('');

            setBusy(busy);
        }

        async function responseError(resp, fallback) {
            var data = await resp.json().catch(function () { return {}; });
            return data.detail || fallback || ('状态码 ' + resp.status);
        }

        async function refreshModels() {
            if (busy) return;
            summary.textContent = '正在读取模型状态…';
            try {
                var resp = await fetch(window.LOCAL_API_BASE + '/api/models');
                if (!resp.ok) throw new Error(await responseError(resp, '读取模型状态失败'));
                renderModels(await resp.json());
            } catch (err) {
                summary.textContent = '模型状态读取失败';
                list.innerHTML = '';
                showStatus(err.message || String(err), 'danger');
            }
        }

        async function deleteModel(modelName) {
            var resp = await fetch(window.LOCAL_API_BASE + '/api/models/' + encodeURIComponent(modelName), {
                method: 'DELETE'
            });
            if (!resp.ok) throw new Error(await responseError(resp, '删除模型失败'));
            return resp.json();
        }

        async function downloadModel(modelName) {
            var timer = setInterval(async function () {
                try {
                    var resp = await fetch(window.LOCAL_API_BASE + '/api/models/download/progress');
                    if (!resp.ok) return;
                    var progress = await resp.json();
                    if (progress.model === modelName) updateProgress(modelName, progress);
                } catch (_) { /* 轮询失败不影响实际下载 */ }
            }, 300);

            updateProgress(modelName, { percent: 0, downloaded: 0, total: 0 });
            try {
                var resp = await fetch(window.LOCAL_API_BASE + '/api/models/download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: modelName })
                });
                if (!resp.ok) throw new Error(await responseError(resp, '模型下载失败'));
            } finally {
                clearInterval(timer);
            }
        }

        async function runAction(action, modelName) {
            if (busy) return;

            if (action === 'delete' && !window.confirm('确定删除模型“' + modelName + '”吗？以后使用时需要重新下载。')) return;
            if (action === 'redownload' && !window.confirm('重新下载会先删除现有模型文件。确定继续吗？')) return;

            showStatus('', 'secondary');
            setBusy(true);
            try {
                if (action === 'delete') {
                    var result = await deleteModel(modelName);
                    setBusy(false);
                    await refreshModels();
                    showStatus('模型已删除，释放 ' + formatBytes(result.freedBytes) + '。', 'success');
                    return;
                }

                if (action === 'redownload') await deleteModel(modelName);
                await downloadModel(modelName);
                setBusy(false);
                await refreshModels();
                showStatus('模型下载完成并已通过完整性校验。', 'success');
            } catch (err) {
                setBusy(false);
                await refreshModels();
                showStatus(err.message || String(err), 'danger');
            }
        }

        openButton.addEventListener('click', function () {
            var settingsEl = document.getElementById('settingsModal');
            var settingsModal = settingsEl ? bootstrap.Modal.getInstance(settingsEl) : null;
            returnToSettings = !!(settingsEl && settingsEl.classList.contains('show'));

            if (returnToSettings && settingsModal) {
                settingsEl.addEventListener('hidden.bs.modal', function () {
                    managerModal.show();
                }, { once: true });
                settingsModal.hide();
            } else {
                managerModal.show();
            }
        });

        modalEl.addEventListener('shown.bs.modal', function () {
            showStatus('', 'secondary');
            refreshModels();
        });

        modalEl.addEventListener('hidden.bs.modal', function () {
            if (!returnToSettings) return;
            returnToSettings = false;
            var settingsEl = document.getElementById('settingsModal');
            if (settingsEl) bootstrap.Modal.getOrCreateInstance(settingsEl).show();
        });

        list.addEventListener('click', function (event) {
            var button = event.target.closest('[data-model-action]');
            if (!button) return;
            runAction(button.getAttribute('data-model-action'), button.getAttribute('data-model-name'));
        });

        if (refreshButton) refreshButton.addEventListener('click', refreshModels);

        if (openDirectoryButton) {
            openDirectoryButton.addEventListener('click', async function () {
                try {
                    var resp = await fetch(window.LOCAL_API_BASE + '/api/models/open-directory', { method: 'POST' });
                    if (!resp.ok) throw new Error(await responseError(resp, '无法打开模型目录'));
                } catch (err) {
                    showStatus(err.message || String(err), 'danger');
                }
            });
        }
    }

    // script.js 在 DOMContentLoaded 末尾派发 app:ready，此时共用的
    // 初始化（历史加载、渲染、设置弹窗）已经跑完，可以安全接管外壳。
    document.addEventListener('app:ready', function () {
        try {
            var parts = collectParts();
            buildLayout(parts);
            moveHistoryIntoSidebar();
            moveClearButtonIntoHeader();
            moveSettingsButtonIntoHeader();
            initSidebar();
            initInstructionsModal();
            initModelManager();
        } finally {
            // 无论成败都要卸下防闪遮罩，否则骨架和历史卡片会一直不可见
            document.documentElement.classList.add('desktop-ready');
        }
    });
})();
