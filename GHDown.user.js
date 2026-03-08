// ==UserScript==
// @name         GitHub 高速下载
// @namespace    https://github.com/wxmyyds
// @version      4.2.0
// @description  GitHub 下载加速：Release文件、源码包、Raw文件一键提速，完美兼容IDM
// @author       wxmyyds
// @match        https://github.com/*
// @match        https://gist.github.com/*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @license      MIT
// @supportURL   https://github.com/wxmyyds/GHDown/issues
// @homepageURL  https://github.com/wxmyyds/GHDown
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    /* ==================== 配置区 ==================== */
    const PROXY_LIST = [
        { url: "https://ghproxy.net/", name: "🚀 主镜像", color: "#2cbe4e" },
        { url: "https://ghp.ci/", name: "⚡ 备用1", color: "#e67e22" },
        { url: "https://moeyy.cn/gh-proxy/", name: "🛡️ 备用2", color: "#3498db" }
    ];

    let currentProxyIndex = parseInt(GM_getValue('proxyIndex', '0'));
    let currentProxy = PROXY_LIST[currentProxyIndex].url;

    /* ==================== 精准匹配规则 ==================== */

    // ✅ 只有这些模式的链接才被认为是"下载链接"
    const DOWNLOAD_PATTERNS = [
        // Release 文件
        '/releases/download/',
        'github-production-release-asset',
        'release-assets.githubusercontent.com',

        // 源码压缩包
        '/archive/',
        '/zipball/',
        '/tarball/',
        'codeload.github.com',

        // Raw 文件
        '/raw/',
        'raw.githubusercontent.com',

        // 文件后缀特征（只匹配以这些结尾的链接）
        '.zip', '.7z', '.rar', '.tar.gz', '.tgz', '.bz2', '.xz',
        '.exe', '.msi', '.deb', '.rpm', '.apk', '.dmg',
        '.jar', '.war', '.nupkg',
        '.pdf', '.epub',
        '.iso', '.img',
        '.sh', '.bin', '.run'
    ];

    // ❌ 绝对排除的导航链接（无论如何都不处理）
    const NAVIGATION_PATTERNS = [
        // 仓库导航
        '/issues',
        '/pull/',
        '/pulls',
        '/actions',
        '/projects',
        '/wiki',
        '/security',
        '/pulse',
        '/forks',
        '/stars',
        '/watchers',

        // 页面内跳转
        '#',
        '/#',

        // 用户/组织相关
        '/settings',
        '/notifications',
        '/sponsors',

        // 特定页面元素
        '/tree/',      // 目录导航
        '/blob/',      // 文件查看（不是下载）
        '/commits/',
        '/branches/',
        '/tags/',
        '/releases/tag/',  // Release 标签页（不是下载）
        '/releases/latest',
        '/expanded_assets',  // "Show all assets" 按钮

        // 社交功能
        '/stargazers',
        '/network',
        '/fork'
    ];

    /* ==================== 工具函数 ==================== */

    function isNavigationLink(href) {
        if (!href) return true;

        // 检查是否匹配排除模式
        if (NAVIGATION_PATTERNS.some(p => href.includes(p))) {
            return true;
        }

        // 检查是否是相对路径的目录导航
        if (href.startsWith('/') && !href.includes('/releases/') && !href.includes('/archive/')) {
            const parts = href.split('/');
            // 如果是 /username/repo 格式，且长度合适，可能是仓库根目录
            if (parts.length === 3 && parts[1] && parts[2]) {
                return true;
            }
        }

        // 检查是否是 GitHub 内部功能链接
        if (href.includes('/commit/') || href.includes('/tree/')) {
            return true;
        }

        return false;
    }

    function isDownloadLink(href) {
        if (!href || typeof href !== 'string') return false;

        // 先排除导航链接
        if (isNavigationLink(href)) return false;

        // 已经是镜像链接？跳过
        if (PROXY_LIST.some(p => href.startsWith(p.url))) return false;

        // 检查是否匹配下载模式
        const isDownload = DOWNLOAD_PATTERNS.some(pattern =>
            href.includes(pattern) || href.endsWith(pattern)
        );

        // 额外的安全检查：确保是文件下载而不是页面
        if (isDownload) {
            // 如果链接指向 GitHub 页面（不是文件），排除
            if (href.includes('/blob/') && !href.includes('raw=true')) {
                return false; // /blob/ 是文件查看页面，不是直接下载
            }

            // 如果链接以 /releases/tag/ 结尾，排除
            if (href.includes('/releases/tag/')) {
                return false;
            }
        }

        return isDownload;
    }

    /* ==================== 核心处理函数 ==================== */

    function processLink(link) {
        // 跳过已处理的
        if (link.getAttribute('data-accel-ready')) return false;

        const href = link.getAttribute('href');

        // 严格判断：只有确认是下载链接才处理
        if (!isDownloadLink(href)) return false;

        // 二次确认：检查元素上下文
        // 如果链接在导航栏、菜单中，可能是误判
        const parentClasses = link.closest('nav, .menu, .dropdown, .header') ? 'nav' : '';
        if (parentClasses) {
            console.debug('跳过导航链接:', href);
            return false;
        }

        try {
            // 构建完整URL
            let fullUrl = href;
            if (fullUrl.startsWith('//')) {
                fullUrl = 'https:' + fullUrl;
            } else if (fullUrl.startsWith('/')) {
                fullUrl = 'https://github.com' + fullUrl;
            }

            const acceleratedUrl = currentProxy + fullUrl;

            // 只替换 href，保持其他属性不变
            link.href = acceleratedUrl;

            // 添加 download 属性（帮助 IDM 识别）
            if (!link.hasAttribute('download')) {
                link.setAttribute('download', '');
            }

            // 标记已处理
            link.setAttribute('data-accel-ready', 'true');

            // 添加极简视觉提示（可选）
            if (!link.querySelector('.accel-mini') && !link.closest('.btn')) {
                const mini = document.createElement('span');
                mini.className = 'accel-mini';
                mini.textContent = '⚡';
                mini.style.marginLeft = '2px';
                mini.style.fontSize = '10px';
                mini.style.opacity = '0.4';
                mini.title = '已加速';
                link.appendChild(mini);
            }

            return true;
        } catch (e) {
            console.debug('处理失败:', e);
            return false;
        }
    }

    /* ==================== 智能扫描（只处理确定的部分） ==================== */

    function scanDownloadLinks() {
        // 只在 Release 页面和文件列表页面深度扫描
        const isReleasesPage = window.location.pathname.includes('/releases');
        const isRepoRoot = window.location.pathname.split('/').length === 3;

        let processed = 0;

        if (isReleasesPage) {
            // Release 页面：扫描所有可能的下载链接
            const releaseLinks = document.querySelectorAll('a[href*="/releases/download/"], a[href*="release-assets"]');
            releaseLinks.forEach(link => {
                if (processLink(link)) processed++;
            });
        }

        // 总是扫描明确的下载链接
        const downloadLinks = document.querySelectorAll('a[href*="/archive/"], a[href*="codeload"], a[href$=".zip"], a[href$=".exe"], a[href$=".msi"]');
        downloadLinks.forEach(link => {
            if (processLink(link)) processed++;
        });

        if (processed > 0) {
            console.log(`[加速] 已处理 ${processed} 个下载链接`);
        }
    }

    /* ==================== 监听器 ==================== */

    function setupObservers() {
        // 只监听特定区域的变化，避免全局监听
        const targetNodes = [
            document.querySelector('.release-main-section'),
            document.querySelector('.repository-content'),
            document.querySelector('.js-release-list')
        ].filter(Boolean);

        if (targetNodes.length === 0) return;

        const observer = new MutationObserver(() => {
            // 使用防抖
            clearTimeout(window.scanTimer);
            window.scanTimer = setTimeout(() => {
                scanDownloadLinks();
            }, 300);
        });

        targetNodes.forEach(node => {
            observer.observe(node, {
                childList: true,
                subtree: true
            });
        });
    }

    /* ==================== 初始化 ==================== */

    function init() {
        console.log('[GitHub加速] 启动，当前镜像:', PROXY_LIST[currentProxyIndex].name);

        // 首次扫描
        setTimeout(scanDownloadLinks, 500);

        // 设置监听
        document.addEventListener('turbo:render', () => {
            setTimeout(scanDownloadLinks, 300);
        });

        setupObservers();

        // 注册菜单命令
        PROXY_LIST.forEach((proxy, index) => {
            GM_registerMenuCommand(`切换到 ${proxy.name}`, () => {
                currentProxyIndex = index;
                currentProxy = proxy.url;
                GM_setValue('proxyIndex', index);
                scanDownloadLinks();
            });
        });
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();