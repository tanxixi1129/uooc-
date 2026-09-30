// ==UserScript==
// @name         UOOC自动学习与评论
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  UOOC自动播放视频、处理测验、切换课程并自动发表评论
// @author       Robin donald
// @match        https://www.uooc.net.cn/home/learn/index*
// @match        *://www.uooc.net.cn/home/course/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @noframes
// @license      Apache License 2.0
// @downloadURL  https://raw.githubusercontent.com/tanxixi1129/uooc-/main/UOOC-auto-comment.user.js
// @updateURL    https://raw.githubusercontent.com/tanxixi1129/uooc-/main/UOOC-auto-comment.user.js
// ==/UserScript==

(function() {
    'use strict';

    const START_BUTTON_ID = 'uooc-auto-comment-start';
    const VIDEO_BUTTON_ID = 'uooc-auto-video-start';
    const VIDEO_PANEL_ID = 'uooc-auto-video-panel';
    let autoCommentRunning = false;
    let autoPlayRunning = false;
    let autoPlayTimer = null;

    const videoConfig = {
        autoPlay: true,
        autoSwitch: true,
        autoQuiz: true,
        doubleSpeed: true
    };

    // 预设评论内容
    const COMMENTS = [
        '这个观点很有见地，学到了很多。',
        '感谢分享，让我对这个问题有了新的认识。',
        '确实，这个问题值得深入思考。',
        '同意这个观点，也想分享一下我的想法...',
        '这个讨论很有意义，希望能有更多交流。'
    ];

    // 随机获取评论内容
    function getRandomComment() {
        return COMMENTS[Math.floor(Math.random() * COMMENTS.length)];
    }

    // 查找普通文本框或新版富文本编辑器
    function findCommentEditor() {
        const selectors = [
            "textarea[placeholder='请输入内容']",
            ".w-e-text[contenteditable='true']",
            "div[contenteditable='true'][role='textbox']",
            "div[contenteditable='true']",
            "textarea[ng-model='content']"
        ];

        for (const selector of selectors) {
            const editor = document.querySelector(selector);
            if (editor) {
                return editor;
            }
        }

        return null;
    }

    // 查找旧版发送按钮或新版回复按钮
    function findSendButton(editor) {
        const oldButton = document.querySelector("button.replay-editor-btn[ng-click='handelReplay()']");
        if (oldButton) {
            return oldButton;
        }

        const labels = new Set(['回复', '发布回复', '发表回复', '发送']);
        const findByLabel = root => Array.from(root.querySelectorAll('button')).find(button => {
            return labels.has(button.textContent.trim());
        });

        const nearbyButton = editor && editor.parentElement
            ? findByLabel(editor.parentElement)
            : null;

        return nearbyButton || findByLabel(document);
    }

    // 同时兼容 textarea 与 contenteditable 富文本编辑器
    function fillCommentEditor(editor, content) {
        editor.focus();

        if ('value' in editor) {
            editor.value = content;
        } else {
            editor.innerHTML = '';
            const paragraph = document.createElement('p');
            paragraph.textContent = content;
            editor.appendChild(paragraph);
        }

        ['input', 'change', 'keyup'].forEach(type => {
            editor.dispatchEvent(new Event(type, { bubbles: true }));
        });

        editor.blur();
    }

    // 发表评论
    async function postComment(content) {
        try {
            // 查找评论文本框
            const commentBox = findCommentEditor();
            if (!commentBox) {
                console.log('未找到评论框');
                return false;
            }

            // 填写评论内容
            fillCommentEditor(commentBox, content);

            // 查找发送按钮
            const sendButton = findSendButton(commentBox);
            if (!sendButton) {
                console.log('未找到发送按钮');
                return false;
            }

            // 点击发送按钮
            sendButton.click();
            console.log(`成功发表评论: ${content.substring(0, 30)}...`);
            return true;
        } catch (error) {
            console.error('发表评论失败:', error);
            return false;
        }
    }

    // 自动评论主函数
    async function autoComment() {
        while (true) {
            try {
                const comment = getRandomComment();
                if (await postComment(comment)) {
                    console.log('等待120秒后发送下一条评论...');
                    await new Promise(resolve => setTimeout(resolve, 120000)); // 2分钟间隔
                } else {
                    console.log('发表失败，等待30秒后重试...');
                    await new Promise(resolve => setTimeout(resolve, 30000));
                }
            } catch (error) {
                console.error('发生错误:', error);
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
        }
    }

    function startAutoComment(button) {
        if (autoCommentRunning) {
            return;
        }

        autoCommentRunning = true;
        if (button) {
            button.disabled = true;
            button.textContent = '评论中...';
        }
        autoComment();
    }

    // 添加评论启动按钮；页面路由重绘后会自动补回
    function ensureCommentButton() {
        if (!document.body || !/\/home\/course\//.test(location.pathname) || document.getElementById(START_BUTTON_ID)) {
            return;
        }

        const button = document.createElement('button');
        button.id = START_BUTTON_ID;
        button.type = 'button';
        button.textContent = autoCommentRunning ? '评论中...' : '开始自动评论';
        button.style.position = 'fixed';
        button.style.top = '80px';
        button.style.right = '24px';
        button.style.zIndex = '2147483647';
        button.style.padding = '8px 16px';
        button.style.backgroundColor = '#4CAF50';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.cursor = 'pointer';

        button.addEventListener('click', () => {
            startAutoComment(button);
        });

        document.body.appendChild(button);
    }

    // ---------- 自动看视频 ----------

    function getCurrentVideo() {
        return document.querySelector('video');
    }

    function applyPlaybackRate(video) {
        if (!video || !videoConfig.doubleSpeed) {
            return;
        }

        if (video.playbackRate !== 2) {
            video.playbackRate = 2;
        }

        const speedButtons = document.querySelectorAll(
            '.video-rate button, button[data-rate="2"], [class*="rate"] button'
        );
        for (const button of speedButtons) {
            const label = button.textContent.trim();
            if (label.includes('2') || label.includes('2x') || label.includes('2倍')) {
                button.click();
                break;
            }
        }
    }

    function handleVideoPlay() {
        const video = getCurrentVideo();
        if (!video) {
            return;
        }

        if (videoConfig.autoPlay && video.paused && !video.ended) {
            const playResult = video.play();
            if (playResult && typeof playResult.catch === 'function') {
                playResult.catch(error => console.log('播放失败:', error));
            }
        }

        applyPlaybackRate(video);
    }

    function handleQuiz() {
        const quizLayer = document.querySelector('.layui-layer.layui-layer-page');
        if (!quizLayer || quizLayer.dataset.uoocHandled === 'true') {
            return;
        }

        const options = Array.from(quizLayer.querySelectorAll(
            'input[type="checkbox"], input[type="radio"]'
        ));
        if (!options.length) {
            return;
        }

        const wrongTip = quizLayer.querySelector('.fl_left[style*="color:red"]');
        if (wrongTip) {
            const match = wrongTip.textContent.match(/:\s*(\[[\s\S]*\])\s*$/);
            if (match) {
                try {
                    const answers = JSON.parse(match[1]);
                    options.forEach(option => { option.checked = false; });
                    answers.forEach(answer => {
                        const option = options.find(item => item.value === answer);
                        if (option) option.click();
                    });
                } catch (error) {
                    console.log('解析答案出错:', error);
                }
            }
        } else if (options[0].type === 'checkbox') {
            const count = Math.min(options.length, Math.floor(Math.random() * 2) + 1);
            const indexes = new Set();
            while (indexes.size < count) {
                indexes.add(Math.floor(Math.random() * options.length));
            }
            indexes.forEach(index => options[index].click());
        } else {
            options[Math.floor(Math.random() * options.length)].click();
        }

        quizLayer.dataset.uoocHandled = 'true';
        setTimeout(() => {
            const confirmButton = quizLayer.querySelector('.btn.btn-success');
            if (confirmButton) confirmButton.click();
        }, 500);
    }

    function clickNextVideo() {
        const videoItems = Array.from(document.querySelectorAll('.icon-video'))
            .map(icon => icon.closest('.basic'))
            .filter(Boolean);
        const currentItem = videoItems.find(item => item.classList.contains('active'));
        const currentIndex = currentItem ? videoItems.indexOf(currentItem) : -1;

        if (currentIndex >= 0 && currentIndex < videoItems.length - 1) {
            videoItems[currentIndex + 1].click();
            setTimeout(setupVideoEvents, 1000);
            return;
        }

        if (!videoConfig.autoSwitch) {
            return;
        }

        const activeSection = document.querySelector('.oneline.ng-binding.active');
        const currentSection = activeSection && activeSection.closest('li');
        const nextSection = currentSection && currentSection.nextElementSibling;
        const nextSectionLink = nextSection && nextSection.querySelector('.oneline.ng-binding');

        if (nextSectionLink) {
            nextSectionLink.click();
            setTimeout(() => {
                const firstVideo = document.querySelector('.icon-video');
                if (firstVideo) {
                    firstVideo.closest('.basic')?.click();
                    setTimeout(setupVideoEvents, 1500);
                }
            }, 1500);
            return;
        }

        const currentChapter = activeSection && activeSection.closest('.catalogItem');
        const nextChapter = currentChapter && currentChapter.nextElementSibling;
        const chapterLink = nextChapter && nextChapter.querySelector('.chapter');
        if (chapterLink) {
            chapterLink.click();
            setTimeout(() => {
                const firstSection = document.querySelector('.rank-2 li .basic');
                if (firstSection) {
                    firstSection.click();
                    setTimeout(() => {
                        const firstVideo = document.querySelector('.icon-video');
                        if (firstVideo) {
                            firstVideo.closest('.basic')?.click();
                            setTimeout(setupVideoEvents, 1500);
                        }
                    }, 1500);
                }
            }, 2000);
        }
    }

    function setupVideoEvents() {
        const video = getCurrentVideo();
        if (!video || video.dataset.uoocBound === 'true') {
            return;
        }

        video.dataset.uoocBound = 'true';
        video.addEventListener('ended', () => {
            if (videoConfig.autoSwitch) clickNextVideo();
        });
        video.addEventListener('ratechange', () => applyPlaybackRate(video));
        applyPlaybackRate(video);
    }

    function startAutoPlaySystem(button) {
        if (autoPlayRunning) {
            return;
        }

        autoPlayRunning = true;
        if (button) {
            button.disabled = true;
            button.textContent = '刷课运行中';
        }
        setupVideoEvents();
        autoPlayTimer = setInterval(() => {
            if (videoConfig.autoQuiz) handleQuiz();
            handleVideoPlay();
            setupVideoEvents();
        }, 2000);
        void autoPlayTimer;
    }

    function addVideoOption(panel, label, key) {
        const row = document.createElement('label');
        row.style.display = 'block';
        row.style.marginBottom = '5px';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = videoConfig[key];
        checkbox.addEventListener('change', () => {
            videoConfig[key] = checkbox.checked;
            if (key === 'doubleSpeed') applyPlaybackRate(getCurrentVideo());
        });

        row.appendChild(checkbox);
        row.appendChild(document.createTextNode(` ${label}`));
        panel.appendChild(row);
    }

    function ensureVideoPanel() {
        if (!document.body || document.getElementById(VIDEO_PANEL_ID)) {
            return;
        }

        const panel = document.createElement('div');
        panel.id = VIDEO_PANEL_ID;
        panel.style.position = 'fixed';
        panel.style.top = '125px';
        panel.style.left = '24px';
        panel.style.zIndex = '2147483646';
        panel.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
        panel.style.padding = '10px';
        panel.style.borderRadius = '5px';
        panel.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.2)';
        addVideoOption(panel, '自动播放', 'autoPlay');
        addVideoOption(panel, '自动切换', 'autoSwitch');
        addVideoOption(panel, '自动测验', 'autoQuiz');
        addVideoOption(panel, '2倍速播放', 'doubleSpeed');
        document.body.appendChild(panel);
    }

    function ensureVideoButton() {
        if (!document.body || !/\/home\/learn\/index/.test(location.pathname)) {
            return;
        }

        ensureVideoPanel();
        if (document.getElementById(VIDEO_BUTTON_ID)) {
            return;
        }

        const button = document.createElement('button');
        button.id = VIDEO_BUTTON_ID;
        button.type = 'button';
        button.textContent = autoPlayRunning ? '刷课运行中' : '刷课启动';
        button.style.position = 'fixed';
        button.style.top = '80px';
        button.style.left = '24px';
        button.style.zIndex = '2147483647';
        button.style.padding = '8px 16px';
        button.style.backgroundColor = '#ff9800';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.cursor = 'pointer';
        button.addEventListener('click', () => startAutoPlaySystem(button));
        document.body.appendChild(button);
    }

    function ensureControls() {
        ensureCommentButton();
        ensureVideoButton();
    }

    if (typeof GM_addStyle === 'function') {
        GM_addStyle(`
            #${START_BUTTON_ID} {
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                position: fixed !important;
                top: 80px !important;
                right: 24px !important;
                z-index: 2147483647 !important;
            }
            #${VIDEO_BUTTON_ID} {
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                position: fixed !important;
                top: 80px !important;
                left: 24px !important;
                z-index: 2147483647 !important;
            }
        `);
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('开始自动评论', () => {
            startAutoComment(document.getElementById(START_BUTTON_ID));
        });
        GM_registerMenuCommand('启动刷课', () => {
            startAutoPlaySystem(document.getElementById(VIDEO_BUTTON_ID));
        });
    }

    // 等待页面加载，并持续处理 Angular 路由重绘
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureControls);
    } else {
        ensureControls();
    }

    new MutationObserver(ensureControls).observe(document.documentElement, {
        childList: true,
        subtree: true
    });
    setInterval(ensureControls, 2000);
    console.info(`[UOOC自动学习与评论] v2.0 已加载：${location.href}`);
})();
