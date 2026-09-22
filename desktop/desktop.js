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
        } finally {
            // 无论成败都要卸下防闪遮罩，否则骨架和历史卡片会一直不可见
            document.documentElement.classList.add('desktop-ready');
        }
    });
})();
