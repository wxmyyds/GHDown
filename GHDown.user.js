// ==UserScript==
// @name         GitHub 高速下载
// @namespace    https://github.com/wxmyyds
// @version      4.3.0
// @description  GitHub 下载加速：Release文件、源码包、Raw文件一键提速
// @author       wxmyyds
// @match        https://github.com/*
// @match        https://gist.github.com/*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @license      MIT
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    /* ==================== 配置与规则 ==================== */
    const PROXY_LIST = [
        { url: "https://ghproxy.net/", name: "🚀 主镜像" },
        { url: "https://ghp.ci/", name: "⚡ 备用1" },
        { url: "https://moeyy.cn/gh-proxy/", name: "🛡️ 备用2" }
    ];

    const WHITE_LIST = ['github.com', 'raw.githubusercontent.com', 'gist.github.com', 'codeload.github.com'];

    const DOWNLOAD_PATTERNS = [
        '/releases/download/', 'github-production-release-asset', 'release-assets.githubusercontent.com',
        '/archive/', '/zipball/', '/tarball/', '/raw/', 'raw.githubusercontent.com'
    ];

    const EXT_PATTERNS = ['.zip', '.7z', '.rar', '.tar.gz', '.tgz', '.exe', '.msi', '.deb', '.dmg', '.apk', '.bin'];

    let currentProxyIndex = parseInt(GM_getValue('proxyIndex', '0'));
    let initialized = false;
    let mainObserver = null;

    /* ==================== 工具函数 ==================== */

    function isDownloadLink(link) {
        try {
            const href = link.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false;

            // 1. 白名单检查：确保是 GitHub 相关域名
            const urlObj = new URL(href, window.location.origin);
            if (!WHITE_LIST.some(domain => urlObj.hostname.includes(domain))) return false;

            // 2. 已经是代理链接则跳过
            if (PROXY_LIST.some(p => href.startsWith(p.url))) return false;

            // 3. 排除非下载链接（精细化：允许 releases/tag/ 内的特定下载路径）
            if (href.includes('/releases/tag/') && !href.includes('/download/')) {
                // 如果是以压缩包后缀结尾的 tag 链接（如 .zip），则允许
                if (!EXT_PATTERNS.some(ext => href.toLowerCase().endsWith(ext))) return false;
            }

            // 4. 排除导航与查看逻辑
            if (href.includes('/blob/') && !href.includes('raw=true')) return false;
            if (link.closest('nav, .AppHeader, .tabnav, .ActionList')) return false;

            // 5. 命中模式
            return DOWNLOAD_PATTERNS.some(p => href.includes(p)) ||
                   EXT_PATTERNS.some(ext => href.toLowerCase().endsWith(ext));
        } catch (e) { return false; }
    }

    /* ==================== 核心处理 ==================== */

    function processLink(link) {
        try {
            if (!isDownloadLink(link)) return;

            // 存储原始 URL（原子化操作）
            if (!link.hasAttribute('data-original-href')) {
                const rawHref = link.getAttribute('href');
                let fullUrl = rawHref;
                if (fullUrl.startsWith('//')) fullUrl = 'https:' + fullUrl;
                else if (fullUrl.startsWith('/')) fullUrl = window.location.origin + fullUrl;
                link.setAttribute('data-original-href', fullUrl);
            }

            const original = link.getAttribute('data-original-href');
            const proxy = PROXY_LIST[currentProxyIndex].url;

            // 避免重复拼接
            link.href = original.startsWith(proxy) ? original : proxy + original;

            // 设置下载属性
            if (!link.hasAttribute('download')) link.setAttribute('download', '');

            link.setAttribute('data-accel-ready', 'true');

            // 视觉提示
            if (!link.querySelector('.accel-mini')) {
                const mini = document.createElement('span');
                mini.className = 'accel-mini';
                mini.textContent = '⚡';
                mini.style.cssText = 'margin-left:2px; font-size:10px; opacity:0.4; pointer-events:none;';
                link.appendChild(mini);
            }
        } catch (e) {
            link.setAttribute('data-accel-ready', 'error');
            console.debug('[GHDown] Error processing link:', e);
        }
    }

    function scanDownloadLinks() {
        // 限制单次扫描规模，防止超大页面卡顿
        const links = Array.from(document.querySelectorAll('a[href]:not([data-accel-ready])')).slice(0, 500);
        if (links.length === 0) return;

        if (window.requestIdleCallback) {
            requestIdleCallback((deadline) => {
                let i = 0;
                while (i < links.length && (deadline.timeRemaining() > 0 || deadline.didTimeout)) {
                    processLink(links[i++]);
                }
            });
        } else {
            setTimeout(() => links.forEach(processLink), 10);
        }
    }

    /* ==================== 监听增强 ==================== */

    function setupObservers() {
        const startObserve = () => {
            if (mainObserver) mainObserver.disconnect();
            mainObserver = new MutationObserver(() => {
                clearTimeout(window.scanTimer);
                window.scanTimer = setTimeout(scanDownloadLinks, 500);
            });
            if (document.body) {
                mainObserver.observe(document.body, { childList: true, subtree: true });
            }
        };

        // 监听 Body 替换（应对某些极端的 SPA 框架行为）
        const rootObserver = new MutationObserver(() => {
            if (document.body && (!mainObserver || !document.body.contains(mainObserver.target))) {
                startObserve();
                scanDownloadLinks();
            }
        });
        rootObserver.observe(document.documentElement, { childList: true });

        startObserve();

        // 兼容所有 GitHub 导航事件
        ['turbo:load', 'turbo:render', 'pjax:success', 'pjax:end'].forEach(event => {
            document.addEventListener(event, () => setTimeout(scanDownloadLinks, 200));
        });
    }

    /* ==================== 初始化与菜单 ==================== */

    function init() {
        if (initialized) return;
        initialized = true;

        scanDownloadLinks();
        setupObservers();

        PROXY_LIST.forEach((proxy, index) => {
            GM_registerMenuCommand(`切换到: ${proxy.name}`, () => {
                currentProxyIndex = index;
                GM_setValue('proxyIndex', index);

                // 深度清理逻辑
                document.querySelectorAll('[data-accel-ready]').forEach(el => {
                    el.removeAttribute('data-accel-ready');
                    if (el.hasAttribute('data-original-href')) {
                        el.href = el.getAttribute('data-original-href');
                    }
                    const mini = el.querySelector('.accel-mini');
                    if (mini) mini.remove();
                });

                scanDownloadLinks();
                console.log(`[GHDown] Switched to: ${proxy.name}`);
            });
        });
    }

    if (document.readyState !== 'loading') init();
    else document.addEventListener('DOMContentLoaded', init);
})();
