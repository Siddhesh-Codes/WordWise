// ============================================================
// WordWise — Content Script
// Shadow DOM tooltip with difficulty badges, favorites,
// context capture, and keyboard shortcut support
// ============================================================

(function () {
    'use strict';

    // Clean up previous instance if extension was reloaded
    if (typeof window.__ttExtCleanup === 'function') {
        try { window.__ttExtCleanup(); } catch (e) { /* ignore */ }
    }

    var hostEl = null;
    var shadow = null;
    var tooltipEl = null;
    var currentAudio = null;
    var selectionTimer = null;
    var cssText = '';
    var ready = false;

    function chromeOk() {
        try { return !!chrome.runtime && !!chrome.runtime.id; } catch (e) { return false; }
    }

    // SVG Icons
    var ICONS = {
        speaker: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>',
        copy: '<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
        source: '<svg viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>',
        heartEmpty: '<svg viewBox="0 0 24 24"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/></svg>',
        heartFull: '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'
    };

    var DIFF_LABELS = {
        common: { text: 'Common', color: '#4ade80', bg: 'rgba(74,222,128,0.15)' },
        intermediate: { text: 'Intermediate', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
        advanced: { text: 'Advanced', color: '#f87171', bg: 'rgba(248,113,113,0.15)' }
    };

    // ----------------------------------------------------------
    // Initialize
    // ----------------------------------------------------------
    init();

    function init() {
        try {
            if (!chromeOk()) { cssText = getMinimalCSS(); ready = true; addListeners(); return; }
            var url = chrome.runtime.getURL('content.css');
            fetch(url).then(function (r) { return r.text(); }).then(function (t) {
                cssText = t;
                ready = true;
                addListeners();
            }).catch(function () {
                cssText = getMinimalCSS();
                ready = true;
                addListeners();
            });
        } catch (e) {
            cssText = getMinimalCSS();
            ready = true;
            addListeners();
        }
    }

    function addListeners() {
        document.addEventListener('mouseup', onMouseUp, true);
        document.addEventListener('keydown', onKeyDown, true);

        // Listen for messages from background (context menu, keyboard shortcut)
        if (chromeOk()) {
            try {
                chrome.runtime.onMessage.addListener(onMessage);
            } catch (e) { /* ignore */ }
        }

        window.__ttExtCleanup = function () {
            try {
                document.removeEventListener('mouseup', onMouseUp, true);
                document.removeEventListener('keydown', onKeyDown, true);
                if (chromeOk()) {
                    try { chrome.runtime.onMessage.removeListener(onMessage); } catch (e) { /* ignore */ }
                }
                removeTooltip();
                if (hostEl) { hostEl.remove(); hostEl = null; shadow = null; }
                ready = false;
            } catch (e) { /* ignore */ }
        };
    }

    // ----------------------------------------------------------
    // Message handler (context menu + keyboard shortcut)
    // ----------------------------------------------------------
    function onMessage(request, sender, sendResponse) {
        try {
            if (request.action === 'defineWord' && request.word) {
                showTooltip(request.word, window.innerWidth / 2 - 170, window.innerHeight / 3);
            }
            if (request.action === 'defineSelectedWord') {
                var sel = window.getSelection();
                var text = sel ? sel.toString().trim() : '';
                if (text && text.length >= 2 && text.length <= 40 && /^[a-zA-Z\u00C0-\u00FF'\-]+$/.test(text)) {
                    var range = sel.getRangeAt(0);
                    var rect = range.getBoundingClientRect();
                    showTooltip(text, rect.left + rect.width / 2, rect.bottom);
                }
            }
        } catch (e) { /* ignore */ }
    }

    // ----------------------------------------------------------
    // Context capture — extract surrounding sentence
    // ----------------------------------------------------------
    function getContext() {
        try {
            var sel = window.getSelection();
            if (!sel || !sel.rangeCount) return null;

            var node = sel.anchorNode;
            if (!node) return null;

            // Get the text content of the parent element
            var parentText = (node.parentElement || node).textContent || '';
            var word = sel.toString().trim();

            // Find the sentence containing the word
            var sentences = parentText.split(/(?<=[.!?;])\s+/);
            var sentence = '';
            for (var i = 0; i < sentences.length; i++) {
                if (sentences[i].toLowerCase().includes(word.toLowerCase())) {
                    sentence = sentences[i].trim();
                    break;
                }
            }

            // Limit sentence length
            if (sentence.length > 200) {
                sentence = sentence.substring(0, 200) + '...';
            }

            return {
                sentence: sentence,
                url: window.location.href
            };
        } catch (e) {
            return null;
        }
    }

    // ----------------------------------------------------------
    // Mouse up — debounced
    // ----------------------------------------------------------
    function onMouseUp(e) {
        try {
            if (!ready) return;
            if (!chromeOk()) { ready = false; return; }
            if (hostEl && (hostEl === e.target || hostEl.contains(e.target))) return;

            clearTimeout(selectionTimer);
            selectionTimer = setTimeout(function () {
                try {
                    var sel = window.getSelection();
                    var text = sel ? sel.toString().trim() : '';

                    if (!text || text.length < 2 || text.length > 40 || /\s/.test(text)) {
                        removeTooltip();
                        return;
                    }
                    if (!/^[a-zA-Z\u00C0-\u00FF'\-]+$/.test(text)) {
                        removeTooltip();
                        return;
                    }

                    showTooltip(text, e.clientX, e.clientY);
                } catch (err) { /* ignore */ }
            }, 200);
        } catch (err) { /* ignore */ }
    }

    function onKeyDown(e) {
        try { if (e.key === 'Escape') removeTooltip(); } catch (err) { /* ignore */ }
    }

    // ----------------------------------------------------------
    // Shadow DOM host
    // ----------------------------------------------------------
    function ensureShadowHost() {
        if (hostEl && document.documentElement.contains(hostEl)) return;

        hostEl = document.createElement('tt-ext-host');
        hostEl.setAttribute('style', [
            'all:initial !important',
            'position:fixed !important',
            'top:0 !important',
            'left:0 !important',
            'width:0 !important',
            'height:0 !important',
            'overflow:visible !important',
            'z-index:2147483647 !important',
            'pointer-events:none !important'
        ].join(';'));

        shadow = hostEl.attachShadow({ mode: 'open' });

        var style = document.createElement('style');
        style.textContent = cssText;
        shadow.appendChild(style);

        document.documentElement.appendChild(hostEl);
    }

    // ----------------------------------------------------------
    // Show tooltip
    // ----------------------------------------------------------
    function showTooltip(word, x, y) {
        try {
            removeTooltip();
            ensureShadowHost();
            if (!shadow) return;

            var context = getContext();

            tooltipEl = document.createElement('div');
            tooltipEl.className = 'tt-ext-tooltip';
            tooltipEl.style.pointerEvents = 'auto';

            tooltipEl.innerHTML =
                '<div class="tt-ext-loading">' +
                '<div class="tt-ext-loading-spinner"></div>' +
                '<span class="tt-ext-loading-text">Looking up "' + escapeHtml(word) + '"...</span>' +
                '</div>';

            shadow.appendChild(tooltipEl);
            positionTooltip(x, y);

            if (!chromeOk()) {
                renderError('Extension was updated. Please reload the page.');
                return;
            }

            chrome.runtime.sendMessage({ action: 'lookup', word: word, context: context }, function (response) {
                try {
                    if (!tooltipEl) return;
                    if (chrome.runtime.lastError) {
                        renderError('Could not connect. Please reload the page.');
                        return;
                    }
                    if (!response || !response.success) {
                        renderError(response ? response.error : 'Something went wrong.');
                        return;
                    }

                    renderDefinition(response.data);
                    positionTooltip(x, y);
                } catch (err) {
                    try { renderError('Extension error. Please reload the page.'); } catch (e) { /* give up */ }
                }
            });
        } catch (err) {
            try { renderError('Extension error. Please reload the page.'); } catch (e) { /* give up */ }
        }
    }

    // ----------------------------------------------------------
    // Render error
    // ----------------------------------------------------------
    function renderError(message) {
        if (!tooltipEl) return;
        tooltipEl.innerHTML =
            '<div class="tt-ext-error">' +
            '<div class="tt-ext-error-icon">📚</div>' +
            '<div class="tt-ext-error-text">' + escapeHtml(message) + '</div>' +
            '</div>';
    }

    // ----------------------------------------------------------
    // Render definition with difficulty badge + favorite
    // ----------------------------------------------------------
    function renderDefinition(data) {
        if (!tooltipEl) return;

        var diff = DIFF_LABELS[data.difficulty] || DIFF_LABELS.advanced;
        var html = '';

        // Header
        html += '<div class="tt-ext-header"><div class="tt-ext-header-left"><div class="tt-ext-word-row">';
        html += '<span class="tt-ext-word">' + escapeHtml(data.word) + '</span>';
        if (data.phonetic) {
            html += '<span class="tt-ext-phonetic">' + escapeHtml(data.phonetic) + '</span>';
        }
        html += '</div>';
        html += '<div class="tt-ext-meta-row">';
        if (data.partOfSpeech) {
            html += '<span class="tt-ext-pos-tag">' + escapeHtml(data.partOfSpeech) + '</span>';
        }
        // Difficulty badge
        html += '<span class="tt-ext-diff-badge" style="color:' + diff.color + ';background:' + diff.bg + '">' + diff.text + '</span>';
        html += '</div></div>';

        // Action buttons
        html += '<div class="tt-ext-header-actions">';
        // Favorite heart
        html += '<button class="tt-ext-fav-btn" data-word="' + escapeHtml(data.word) + '" title="Save to favorites">' + ICONS.heartEmpty + '</button>';
        // Audio
        html += '<button class="tt-ext-audio-btn" data-audio="' + escapeHtml(data.audioUrl || '') + '" data-word="' + escapeHtml(data.word) + '" title="Listen to pronunciation">' + ICONS.speaker + '</button>';
        html += '</div></div>';

        // Body
        html += '<div class="tt-ext-body">';
        html += '<div class="tt-ext-section-label">Definition</div>';
        html += '<div class="tt-ext-definition">' + escapeHtml(data.definition) + '</div>';

        // Translation
        if (data.translation) {
            html += '<div class="tt-ext-translation"><span class="tt-ext-trans-icon">🌍</span> ' + escapeHtml(data.translation) + '</div>';
        }

        // Etymology
        if (data.etymology) {
            html += '<div class="tt-ext-etymology"><span class="tt-ext-ety-icon">🏛️</span> ' + escapeHtml(data.etymology) + '</div>';
        }

        // Examples
        if (data.examples && data.examples.length > 0) {
            html += '<div class="tt-ext-examples"><div class="tt-ext-section-label">Real-World Examples</div>';
            for (var i = 0; i < data.examples.length; i++) {
                html += '<div class="tt-ext-example"><span class="tt-ext-example-num">' + (i + 1) + '.</span> ' + escapeHtml(data.examples[i]) + '</div>';
            }
            html += '</div>';
        }

        // Synonyms
        if (data.synonyms && data.synonyms.length > 0) {
            html += '<div class="tt-ext-chips-section"><div class="tt-ext-section-label">Synonyms</div><div class="tt-ext-chips">';
            for (var j = 0; j < data.synonyms.length; j++) {
                html += '<span class="tt-ext-synonym-chip" data-word="' + escapeHtml(data.synonyms[j]) + '">' + escapeHtml(data.synonyms[j]) + '</span>';
            }
            html += '</div></div>';
        }

        // Antonyms
        if (data.antonyms && data.antonyms.length > 0) {
            html += '<div class="tt-ext-chips-section"><div class="tt-ext-section-label">Antonyms</div><div class="tt-ext-chips">';
            for (var k = 0; k < data.antonyms.length; k++) {
                html += '<span class="tt-ext-antonym-chip">' + escapeHtml(data.antonyms[k]) + '</span>';
            }
            html += '</div></div>';
        }

        html += '</div>';

        // Footer
        html += '<div class="tt-ext-footer">';
        html += '<button class="tt-ext-footer-btn tt-ext-copy-btn" title="Copy definition">' + ICONS.copy + ' Copy</button>';
        if (data.sourceUrl) {
            html += '<a class="tt-ext-footer-btn" href="' + escapeHtml(data.sourceUrl) + '" target="_blank" rel="noopener" title="Source">' + ICONS.source + ' Source</a>';
        }
        html += '</div>';

        tooltipEl.innerHTML = html;

        // --- Attach event listeners ---

        // Audio
        var audioBtn = tooltipEl.querySelector('.tt-ext-audio-btn');
        if (audioBtn) {
            audioBtn.addEventListener('click', function (ev) {
                ev.stopPropagation();
                playAudio(audioBtn.getAttribute('data-audio'), audioBtn.getAttribute('data-word'));
                audioBtn.classList.remove('tt-ext-playing');
                void audioBtn.offsetWidth;
                audioBtn.classList.add('tt-ext-playing');
            });
        }

        // Favorite
        var favBtn = tooltipEl.querySelector('.tt-ext-fav-btn');
        if (favBtn) {
            // Check current favorite status
            if (chromeOk()) {
                try {
                    chrome.runtime.sendMessage({ action: 'getFavorites' }, function (resp) {
                        try {
                            if (resp && resp.success && resp.favorites) {
                                var isFav = resp.favorites.some(function (f) { return f.word.toLowerCase() === data.word.toLowerCase(); });
                                if (isFav && favBtn) {
                                    favBtn.innerHTML = ICONS.heartFull;
                                    favBtn.classList.add('tt-ext-fav-active');
                                }
                            }
                        } catch (e) { /* ignore */ }
                    });
                } catch (e) { /* ignore */ }
            }

            favBtn.addEventListener('click', function (ev) {
                ev.stopPropagation();
                if (!chromeOk()) return;
                try {
                    chrome.runtime.sendMessage({ action: 'toggleFavorite', word: data.word }, function (resp) {
                        try {
                            if (resp && resp.success && favBtn) {
                                if (resp.isFavorite) {
                                    favBtn.innerHTML = ICONS.heartFull;
                                    favBtn.classList.add('tt-ext-fav-active');
                                } else {
                                    favBtn.innerHTML = ICONS.heartEmpty;
                                    favBtn.classList.remove('tt-ext-fav-active');
                                }
                            }
                        } catch (e) { /* ignore */ }
                    });
                } catch (e) { /* ignore */ }
            });
        }

        // Copy
        var copyBtn = tooltipEl.querySelector('.tt-ext-copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', function (ev) {
                ev.stopPropagation();
                var t = data.word + ' (' + (data.partOfSpeech || '') + '): ' + data.definition;
                navigator.clipboard.writeText(t).then(function () { showCopiedToast(); });
            });
        }

        // Synonym chips
        var chips = tooltipEl.querySelectorAll('.tt-ext-synonym-chip');
        chips.forEach(function (chip) {
            chip.addEventListener('click', function (ev) {
                ev.stopPropagation();
                var w = chip.getAttribute('data-word');
                if (w) {
                    var rect = tooltipEl.getBoundingClientRect();
                    showTooltip(w, rect.left + 20, rect.top + 20);
                }
            });
        });
    }

    // ----------------------------------------------------------
    // Position tooltip
    // ----------------------------------------------------------
    function positionTooltip(x, y) {
        if (!tooltipEl) return;
        requestAnimationFrame(function () {
            if (!tooltipEl) return;
            var margin = 14;
            var rect = tooltipEl.getBoundingClientRect();
            var vw = window.innerWidth;
            var vh = window.innerHeight;
            var tw = rect.width || 340;
            var th = rect.height || 200;
            var left = x + margin;
            var top = y + margin;
            if (left + tw > vw - margin) left = x - tw - margin;
            if (left < margin) left = margin;
            if (top + th > vh - margin) top = y - th - margin;
            if (top < margin) top = margin;
            tooltipEl.style.left = left + 'px';
            tooltipEl.style.top = top + 'px';
        });
    }

    // ----------------------------------------------------------
    // Remove tooltip
    // ----------------------------------------------------------
    function removeTooltip() {
        if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
        if (currentAudio) { try { currentAudio.pause(); } catch (e) { /* ignore */ } currentAudio = null; }
    }

    // ----------------------------------------------------------
    // Audio — API audio or SpeechSynthesis fallback
    // ----------------------------------------------------------
    function playAudio(url, word) {
        if (currentAudio) { try { currentAudio.pause(); } catch (e) { /* ignore */ } currentAudio = null; }
        try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }

        if (url) {
            currentAudio = new Audio(url);
            currentAudio.volume = 0.7;
            currentAudio.play().catch(function () { speakWord(word); });
        } else {
            speakWord(word);
        }
    }

    function speakWord(word) {
        if (!word || !window.speechSynthesis) return;
        var u = new SpeechSynthesisUtterance(word);
        u.lang = 'en-US'; u.rate = 0.9; u.pitch = 1; u.volume = 0.8;
        window.speechSynthesis.speak(u);
    }

    // ----------------------------------------------------------
    // Toast
    // ----------------------------------------------------------
    function showCopiedToast() {
        if (!shadow) return;
        var existing = shadow.querySelector('.tt-ext-copied-toast');
        if (existing) existing.remove();
        var toast = document.createElement('div');
        toast.className = 'tt-ext-copied-toast';
        toast.textContent = '\u2713 Definition copied!';
        toast.style.pointerEvents = 'none';
        shadow.appendChild(toast);
        setTimeout(function () { try { toast.remove(); } catch (e) { /* ignore */ } }, 2000);
    }

    // ----------------------------------------------------------
    // Utilities
    // ----------------------------------------------------------
    function escapeHtml(str) {
        if (!str) return '';
        var d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function getMinimalCSS() {
        return [
            '.tt-ext-tooltip{position:fixed;z-index:2147483647;width:360px;max-height:440px;overflow-y:auto;border-radius:16px;font-family:Segoe UI,Inter,-apple-system,sans-serif;font-size:14px;line-height:1.55;color:#e8e6f0;background:rgba(22,18,42,0.96);border:1px solid rgba(108,60,225,.3);box-shadow:0 8px 32px rgba(0,0,0,.4);padding:0;opacity:1;}',
            '.tt-ext-header{padding:16px 18px 12px;background:linear-gradient(135deg,rgba(108,60,225,.25),rgba(79,143,255,.12));border-bottom:1px solid rgba(108,60,225,.2);display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}',
            '.tt-ext-header-left{flex:1;min-width:0;}.tt-ext-header-actions{display:flex;gap:6px;align-items:center;}',
            '.tt-ext-word-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
            '.tt-ext-word{font-size:20px;font-weight:700;color:#fff;text-transform:capitalize;}',
            '.tt-ext-phonetic{font-size:13px;color:#a78bfa;font-style:italic;}',
            '.tt-ext-meta-row{display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap;}',
            '.tt-ext-pos-tag{padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;text-transform:uppercase;background:rgba(108,60,225,.3);color:#c4b5fd;}',
            '.tt-ext-diff-badge{padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.03em;}',
            '.tt-ext-audio-btn{width:34px;height:34px;border:none;border-radius:50%;background:linear-gradient(135deg,#6C3CE1,#4F8FFF);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;}',
            '.tt-ext-audio-btn svg{width:16px;height:16px;fill:currentColor;}',
            '.tt-ext-fav-btn{width:34px;height:34px;border:none;border-radius:50%;background:rgba(255,255,255,.08);color:#9ca3af;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;transition:all .2s;}',
            '.tt-ext-fav-btn svg{width:18px;height:18px;fill:currentColor;}',
            '.tt-ext-fav-active{color:#f87171;background:rgba(248,113,113,.15);}',
            '.tt-ext-body{padding:14px 18px 8px;}',
            '.tt-ext-definition{font-size:14px;line-height:1.6;color:#d4d0e0;margin-bottom:14px;}',
            '.tt-ext-section-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:8px;display:flex;align-items:center;gap:6px;}',
            '.tt-ext-section-label::after{content:"";flex:1;height:1px;background:rgba(108,60,225,.15);}',
            '.tt-ext-example{padding:10px 14px;margin-bottom:8px;border-radius:10px;background:rgba(108,60,225,.1);border-left:3px solid #7c3aed;font-size:13px;font-style:italic;color:#c4b5fd;}',
            '.tt-ext-example-num{font-style:normal;font-weight:700;color:#a78bfa;margin-right:4px;}',
            '.tt-ext-chips{display:flex;flex-wrap:wrap;gap:6px;}',
            '.tt-ext-chips-section{margin-bottom:12px;}',
            '.tt-ext-synonym-chip{padding:4px 12px;border-radius:20px;font-size:12px;cursor:pointer;background:rgba(79,143,255,.15);color:#93bbff;border:1px solid rgba(79,143,255,.3);transition:all .2s;}',
            '.tt-ext-synonym-chip:hover{background:rgba(79,143,255,.3);color:#bdd5ff;transform:translateY(-1px);}',
            '.tt-ext-antonym-chip{padding:4px 12px;border-radius:20px;font-size:12px;background:rgba(239,68,68,.12);color:#fca5a5;border:1px solid rgba(239,68,68,.25);}',
            '.tt-ext-footer{display:flex;align-items:center;justify-content:flex-end;gap:4px;padding:8px 14px;border-top:1px solid rgba(108,60,225,.2);}',
            '.tt-ext-footer-btn{display:flex;align-items:center;gap:5px;padding:6px 12px;border:none;border-radius:8px;font-size:12px;color:#a78bfa;background:transparent;cursor:pointer;text-decoration:none;}',
            '.tt-ext-footer-btn svg{width:14px;height:14px;fill:currentColor;}',
            '.tt-ext-loading{display:flex;flex-direction:column;align-items:center;padding:32px 20px;gap:14px;}',
            '.tt-ext-loading-spinner{width:28px;height:28px;border:3px solid rgba(108,60,225,.15);border-top-color:#6C3CE1;border-radius:50%;animation:tt-ext-spin .7s linear infinite;}',
            '@keyframes tt-ext-spin{to{transform:rotate(360deg)}}',
            '.tt-ext-loading-text{font-size:13px;color:#a78bfa;}',
            '.tt-ext-error{display:flex;flex-direction:column;align-items:center;padding:28px 20px;gap:10px;text-align:center;}',
            '.tt-ext-error-icon{font-size:28px;}.tt-ext-error-text{font-size:13px;color:#d4d0e0;}',
            '.tt-ext-copied-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#6C3CE1,#4F8FFF);color:#fff;padding:10px 22px;border-radius:24px;font-family:Segoe UI,sans-serif;font-size:13px;font-weight:600;box-shadow:0 4px 16px rgba(108,60,225,.4);z-index:2147483647;}'
        ].join('\n');
    }

})();
