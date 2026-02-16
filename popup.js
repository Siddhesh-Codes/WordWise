// ============================================================
// WordWise v2.2 — Popup Script
// Onboarding, XP/levels, themes, 4 quiz types, mastery,
// vocab strength, SR flashcards, confetti, daily goal, export
// ============================================================

document.addEventListener('DOMContentLoaded', function () {

    // ---- Theme ----
    applyTheme();

    function applyTheme() {
        chrome.runtime.sendMessage({ action: 'getSettings' }, response => {
            if (!response?.success) return;
            const theme = response.settings.theme || 'dark';
            document.body.className = '';
            if (theme !== 'dark') document.body.classList.add('theme-' + theme);
        });
    }

    // ---- Onboarding ----
    chrome.runtime.sendMessage({ action: 'getOnboarded' }, response => {
        if (response?.success && !response.onboarded) {
            document.getElementById('onboarding').style.display = 'flex';
        }
    });

    document.getElementById('startBtn').addEventListener('click', () => {
        document.getElementById('onboarding').style.display = 'none';
        chrome.runtime.sendMessage({ action: 'setOnboarded' });
    });

    // ---- Tab Navigation ----
    const tabs = document.querySelectorAll('.ww-tab');
    const panels = document.querySelectorAll('.ww-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('panel-' + target)?.classList.add('active');

            if (target === 'stats') loadStats();
            if (target === 'flashcards') loadFlashcard();
            if (target === 'quiz') loadQuiz();
            if (target === 'settings') loadSettings();
        });
    });

    // ---- Init ----
    loadStreak();
    loadDailyGoal();
    loadXPMini();
    loadWotD();
    loadHistory();

    // ---- Search ----
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const searchResult = document.getElementById('searchResult');

    searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    searchBtn.addEventListener('click', doSearch);

    function doSearch() {
        const word = searchInput.value.trim();
        if (!word || word.length < 2) return;

        searchResult.style.display = 'block';
        searchResult.innerHTML = '<div class="ww-loading"><div class="ww-spinner"></div></div>';

        chrome.runtime.sendMessage({ action: 'lookup', word }, response => {
            if (!response || !response.success) {
                searchResult.innerHTML = '<div class="ww-empty-state">' + (response ? response.error : 'Something went wrong.') + '</div>';
                return;
            }
            renderSearchResult(response.data);
            loadHistory();
            loadStreak();
            loadDailyGoal();
            loadXPMini();

            // Show XP notification if leveled up
            if (response.xp && response.xp.leveledUp) {
                showXPNotification(response.xp);
            }
        });
    }

    function showXPNotification(xp) {
        const LEVELS = [
            { level: 1, title: 'Novice', icon: '🌱' }, { level: 2, title: 'Curious', icon: '🔍' },
            { level: 3, title: 'Learner', icon: '📖' }, { level: 4, title: 'Explorer', icon: '🧭' },
            { level: 5, title: 'Word Smith', icon: '🔨' }, { level: 6, title: 'Linguist', icon: '🗣️' },
            { level: 7, title: 'Scholar', icon: '🎓' }, { level: 8, title: 'Polyglot', icon: '🌍' },
            { level: 9, title: 'Lexicon Master', icon: '👑' }, { level: 10, title: 'Word Wizard', icon: '🧙' }
        ];
        const lvl = LEVELS.find(l => l.level === xp.level) || LEVELS[0];
        fireConfetti();

        // Flash header tagline
        const tagline = document.getElementById('levelTitle');
        tagline.textContent = '🎉 Level ' + xp.level + '! ' + lvl.title;
        tagline.style.color = '#4ade80';
        setTimeout(() => { tagline.style.color = ''; loadXPMini(); }, 3000);
    }

    function renderSearchResult(data) {
        const diffColors = { common: { c: '#4ade80', bg: 'rgba(74,222,128,.15)' }, intermediate: { c: '#fbbf24', bg: 'rgba(251,191,36,.15)' }, advanced: { c: '#f87171', bg: 'rgba(248,113,113,.15)' } };
        const d = diffColors[data.difficulty] || diffColors.advanced;

        let html = '<div class="ww-result-card">';
        html += '<div class="ww-result-header"><div>';
        html += '<div class="ww-result-word">' + esc(data.word) + '</div>';
        if (data.phonetic) html += '<div class="ww-result-phonetic">' + esc(data.phonetic) + '</div>';
        html += '<div class="ww-result-meta">';
        if (data.partOfSpeech) html += '<span class="ww-wotd-pos">' + esc(data.partOfSpeech) + '</span>';
        html += '<span class="ww-wotd-diff" style="color:' + d.c + ';background:' + d.bg + '">' + esc(data.difficulty) + '</span>';
        html += '</div></div>';
        html += '<div class="ww-result-actions">';
        html += '<button class="ww-result-action-btn ww-result-fav-btn" data-word="' + esc(data.word) + '">❤️</button>';
        html += '<button class="ww-result-action-btn ww-result-audio-btn" data-audio="' + esc(data.audioUrl || '') + '" data-word="' + esc(data.word) + '">🔊</button>';
        html += '</div></div>';
        html += '<div class="ww-result-def">' + esc(data.definition) + '</div>';

        if (data.translation) {
            html += '<div class="ww-result-trans">🌍 ' + esc(data.translation) + '</div>';
        }
        if (data.etymology) {
            html += '<div class="ww-result-ety">🏛️ ' + esc(data.etymology) + '</div>';
        }
        if (data.examples && data.examples.length > 0) {
            data.examples.forEach(ex => {
                html += '<div class="ww-result-example">"' + esc(ex) + '"</div>';
            });
        }
        if (data.synonyms && data.synonyms.length > 0) {
            html += '<div class="ww-result-chips">';
            data.synonyms.forEach(s => { html += '<span class="ww-result-chip">' + esc(s) + '</span>'; });
            html += '</div>';
        }
        html += '</div>';
        searchResult.innerHTML = html;

        const audioBtn = searchResult.querySelector('.ww-result-audio-btn');
        if (audioBtn) audioBtn.addEventListener('click', () => playAudio(audioBtn.dataset.audio, audioBtn.dataset.word));

        const favBtn = searchResult.querySelector('.ww-result-fav-btn');
        if (favBtn) {
            chrome.runtime.sendMessage({ action: 'getFavorites' }, resp => {
                if (resp?.success && resp.favorites.some(f => f.word.toLowerCase() === data.word.toLowerCase())) favBtn.classList.add('active');
            });
            favBtn.addEventListener('click', () => {
                chrome.runtime.sendMessage({ action: 'toggleFavorite', word: data.word }, resp => {
                    if (resp?.success) favBtn.classList.toggle('active', resp.isFavorite);
                });
            });
        }
    }

    // ---- WotD ----
    function loadWotD() {
        chrome.runtime.sendMessage({ action: 'getWordOfDay' }, response => {
            if (!response?.success) return;
            const data = response.data;
            const card = document.getElementById('wotdCard');
            card.style.display = 'block';
            document.getElementById('wotdWord').textContent = data.word;
            document.getElementById('wotdPhonetic').textContent = data.phonetic || '';
            document.getElementById('wotdDef').textContent = data.definition;
            document.getElementById('wotdPos').textContent = data.partOfSpeech || '';
            const diffEl = document.getElementById('wotdDiff');
            diffEl.textContent = data.difficulty || '';
            const dc = { common: '#4ade80', intermediate: '#fbbf24', advanced: '#f87171' };
            const db = { common: 'rgba(74,222,128,.15)', intermediate: 'rgba(251,191,36,.15)', advanced: 'rgba(248,113,113,.15)' };
            diffEl.style.color = dc[data.difficulty] || '#f87171';
            diffEl.style.background = db[data.difficulty] || 'rgba(248,113,113,.15)';
            card.addEventListener('click', () => { searchInput.value = data.word; doSearch(); });
        });
    }

    // ---- History ----
    function loadHistory() {
        chrome.runtime.sendMessage({ action: 'getHistory' }, response => {
            if (!response?.success || !response.history.length) {
                document.getElementById('historyList').innerHTML = '<div class="ww-empty-state">No lookups yet. Select a word on any page!</div>';
                return;
            }
            const dc = { common: '#4ade80', intermediate: '#fbbf24', advanced: '#f87171' };
            const db = { common: 'rgba(74,222,128,.15)', intermediate: 'rgba(251,191,36,.15)', advanced: 'rgba(248,113,113,.15)' };
            const mc = (m) => m >= 80 ? '#4ade80' : m >= 50 ? '#fbbf24' : '#f87171';
            let html = '';
            response.history.forEach(item => {
                html += '<div class="ww-history-item" data-word="' + esc(item.word) + '">';
                html += '<span class="ww-history-word">' + esc(item.word) + '</span>';
                html += '<span class="ww-history-def">' + esc(item.definition) + '</span>';
                html += '<span class="ww-history-diff" style="color:' + (dc[item.difficulty] || '#f87171') + ';background:' + (db[item.difficulty] || 'rgba(248,113,113,.15)') + '">' + esc(item.difficulty || '') + '</span>';
                // Mastery indicator
                html += '<span class="ww-history-mastery" style="color:' + mc(item.mastery || 0) + ';border-color:' + mc(item.mastery || 0) + '">' + (item.mastery || 0) + '%</span>';
                html += '</div>';
            });
            document.getElementById('historyList').innerHTML = html;
            document.querySelectorAll('.ww-history-item').forEach(item => {
                item.addEventListener('click', () => { searchInput.value = item.dataset.word; doSearch(); });
            });
        });
    }

    document.getElementById('clearHistoryBtn').addEventListener('click', () => {
        if (confirm('Clear all vocabulary data?')) {
            chrome.runtime.sendMessage({ action: 'clearHistory' }, () => { loadHistory(); loadStreak(); loadDailyGoal(); loadXPMini(); });
        }
    });

    // ---- Streak ----
    function loadStreak() {
        chrome.runtime.sendMessage({ action: 'getStats' }, response => {
            if (response?.success) document.getElementById('streakCount').textContent = response.stats.streak || 0;
        });
    }

    // ---- Daily Goal ----
    function loadDailyGoal() {
        chrome.runtime.sendMessage({ action: 'getDailyGoal' }, response => {
            if (!response?.success) return;
            document.getElementById('goalFill').setAttribute('stroke-dasharray', response.percentage + ', 100');
            document.getElementById('goalText').textContent = response.progress + '/' + response.goal;
            if (response.completed && !window._goalCelebrated) {
                window._goalCelebrated = true;
                fireConfetti();
            }
        });
    }

    // ---- XP Mini Bar ----
    function loadXPMini() {
        chrome.runtime.sendMessage({ action: 'getXP' }, response => {
            if (!response?.success) return;
            document.getElementById('xpMiniFill').style.width = response.progress + '%';
            document.getElementById('xpMiniText').textContent = 'Lv' + response.level;
            document.getElementById('levelTitle').textContent = response.title + ' ' + response.icon;
        });
    }

    // ---- Flashcards ----
    let currentFC = '';
    const flashcard = document.getElementById('flashcard');
    const fcContainer = document.getElementById('flashcardContainer');
    const srActions = document.getElementById('srActions');
    const fcEmpty = document.getElementById('fcEmpty');

    flashcard.addEventListener('click', () => flashcard.classList.toggle('flipped'));

    ['Again', 'Hard', 'Good', 'Easy'].forEach((label, idx) => {
        document.getElementById('sr' + label).addEventListener('click', () => {
            if (!currentFC) return;
            chrome.runtime.sendMessage({ action: 'markFlashcard', word: currentFC, quality: idx }, () => {
                flashcard.classList.remove('flipped');
                loadXPMini();
                setTimeout(loadFlashcard, 300);
            });
        });
    });

    function loadFlashcard() {
        chrome.runtime.sendMessage({ action: 'getFlashcard' }, response => {
            if (!response?.success) {
                fcContainer.style.display = 'none';
                srActions.style.display = 'none';
                fcEmpty.style.display = 'flex';
                document.getElementById('fcProgress').textContent = '';
                return;
            }
            fcContainer.style.display = 'block';
            srActions.style.display = 'flex';
            fcEmpty.style.display = 'none';

            const card = response.card;
            currentFC = card.word;
            document.getElementById('fcWord').textContent = card.word;
            document.getElementById('fcPhonetic').textContent = card.phonetic || '';
            document.getElementById('fcPos').textContent = card.partOfSpeech || '';
            document.getElementById('fcDefinition').textContent = card.definition;
            document.getElementById('fcExample').textContent = card.examples?.[0] ? '"' + card.examples[0] + '"' : '';
            document.getElementById('fcEtymology').textContent = card.etymology ? '🏛️ ' + card.etymology : '';

            // Mastery bar
            const masteryPct = card.mastery || 0;
            document.getElementById('fcMasteryFill').style.width = masteryPct + '%';

            const intervalText = card.interval ? ' • Next in ~' + card.interval + 'min' : '';
            document.getElementById('fcProgress').textContent =
                'Mastery: ' + masteryPct + '% • Looked up ' + (card.lookupCount || 1) + 'x' +
                (response.reviewsDone ? ' • All reviews done!' : intervalText);

            flashcard.classList.remove('flipped');
        });
    }

    // ---- Quiz Mode ----
    let currentQuizType = 'definition';
    let currentQuizAnswer = '';

    // Quiz type selector
    document.querySelectorAll('.ww-quiz-type').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.ww-quiz-type').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentQuizType = this.dataset.type;
            loadQuizQuestion();
        });
    });

    function loadQuiz() {
        loadQuizStats();
        loadQuizQuestion();
    }

    function loadQuizStats() {
        chrome.runtime.sendMessage({ action: 'getQuizStats' }, response => {
            if (!response?.success) return;
            const qs = response.quizStats;
            document.getElementById('qsCorrect').textContent = qs.correct || 0;
            document.getElementById('qsTotal').textContent = qs.total || 0;
            document.getElementById('qsStreak').textContent = qs.streak || 0;
        });
    }

    function loadQuizQuestion() {
        const card = document.getElementById('quizCard');
        const feedback = document.getElementById('quizFeedback');
        const nextBtn = document.getElementById('quizNext');
        const empty = document.getElementById('quizEmpty');
        const clueEl = document.getElementById('quizClue');
        const spellingEl = document.getElementById('quizSpelling');
        const optionsEl = document.getElementById('quizOptions');

        feedback.style.display = 'none';
        nextBtn.style.display = 'none';
        clueEl.style.display = 'none';
        spellingEl.style.display = 'none';
        optionsEl.innerHTML = '';

        chrome.runtime.sendMessage({ action: 'getQuizQuestion', quizType: currentQuizType }, response => {
            if (!response?.success) {
                card.style.display = 'none';
                empty.style.display = 'flex';
                return;
            }

            card.style.display = 'block';
            empty.style.display = 'none';

            const q = response.question;
            currentQuizAnswer = q.answer;

            // Common: prompt
            document.getElementById('quizPrompt').textContent = q.prompt;

            // Difficulty badge
            const diffEl = document.getElementById('quizDiff');
            const dc = { common: '#4ade80', intermediate: '#fbbf24', advanced: '#f87171' };
            const db = { common: 'rgba(74,222,128,.15)', intermediate: 'rgba(251,191,36,.15)', advanced: 'rgba(248,113,113,.15)' };
            diffEl.textContent = q.difficulty || '';
            diffEl.style.color = dc[q.difficulty] || '#f87171';
            diffEl.style.background = db[q.difficulty] || 'rgba(248,113,113,.15)';

            if (q.type === 'spelling') {
                // Spelling quiz: show definition in clue, audio button, input
                document.getElementById('quizWord').textContent = '???';
                clueEl.style.display = 'block';
                clueEl.textContent = q.clue; // shows definition as hint
                spellingEl.style.display = 'flex';
                optionsEl.style.display = 'none';

                const spellingInput = document.getElementById('spellingInput');
                spellingInput.value = '';
                spellingInput.focus();

                // Listen button
                const listenBtn = document.getElementById('quizListenBtn');
                const newListenBtn = listenBtn.cloneNode(true);
                listenBtn.parentNode.replaceChild(newListenBtn, listenBtn);
                newListenBtn.addEventListener('click', () => playAudio(q.audioUrl, q.word));

                // Auto-play
                playAudio(q.audioUrl, q.word);

                // Submit button
                const submitBtn = document.getElementById('spellingSubmit');
                const newSubmitBtn = submitBtn.cloneNode(true);
                submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
                newSubmitBtn.addEventListener('click', () => checkSpelling(q));

                spellingInput.addEventListener('keydown', function onKeyDown(e) {
                    if (e.key === 'Enter') { checkSpelling(q); spellingInput.removeEventListener('keydown', onKeyDown); }
                });

            } else if (q.type === 'reverse' || q.type === 'fillblank') {
                // Show clue (definition or blanked sentence)
                document.getElementById('quizWord').textContent = '';
                clueEl.style.display = 'block';
                clueEl.textContent = q.clue;
                spellingEl.style.display = 'none';
                optionsEl.style.display = 'flex';
                renderOptions(q);

            } else {
                // Default: definition quiz
                document.getElementById('quizWord').textContent = q.clue; // word
                clueEl.style.display = 'none';
                spellingEl.style.display = 'none';
                optionsEl.style.display = 'flex';
                renderOptions(q);
            }
        });
    }

    function renderOptions(q) {
        let optionsHtml = '';
        q.options.forEach((opt, i) => {
            optionsHtml += '<button class="ww-quiz-option" data-idx="' + i + '" data-correct="' + opt.isCorrect + '">' + esc(opt.text) + '</button>';
        });
        document.getElementById('quizOptions').innerHTML = optionsHtml;

        document.querySelectorAll('.ww-quiz-option').forEach(btn => {
            btn.addEventListener('click', function () {
                const isCorrect = this.dataset.correct === 'true';
                document.querySelectorAll('.ww-quiz-option').forEach(b => {
                    b.classList.add('disabled');
                    if (b.dataset.correct === 'true') b.classList.add('correct');
                });
                if (isCorrect) { this.classList.add('correct'); showQuizFeedback(true); }
                else { this.classList.add('wrong'); showQuizFeedback(false); }
                submitAnswer(q.answer, isCorrect);
            });
        });
    }

    function checkSpelling(q) {
        const input = document.getElementById('spellingInput').value.trim().toLowerCase();
        const correct = q.answer.toLowerCase();
        const isCorrect = input === correct;

        const feedback = document.getElementById('quizFeedback');
        if (isCorrect) {
            showQuizFeedback(true);
            document.getElementById('quizWord').textContent = q.word;
        } else {
            feedback.className = 'ww-quiz-feedback wrong-fb';
            feedback.textContent = '❌ The correct spelling is: ' + q.word;
            feedback.style.display = 'block';
            document.getElementById('quizWord').textContent = q.word;
            document.getElementById('quizNext').style.display = 'block';
        }
        submitAnswer(q.word, isCorrect);
    }

    function showQuizFeedback(isCorrect) {
        const feedback = document.getElementById('quizFeedback');
        if (isCorrect) {
            feedback.className = 'ww-quiz-feedback correct-fb';
            feedback.textContent = '✅ Correct! Great job!';
        } else {
            feedback.className = 'ww-quiz-feedback wrong-fb';
            feedback.textContent = '❌ Not quite. Check the correct answer.';
        }
        feedback.style.display = 'block';
        document.getElementById('quizNext').style.display = 'block';
    }

    function submitAnswer(word, correct) {
        chrome.runtime.sendMessage({ action: 'submitQuizAnswer', word, correct }, resp => {
            if (resp?.success) {
                const qs = resp.quizStats;
                document.getElementById('qsCorrect').textContent = qs.correct || 0;
                document.getElementById('qsTotal').textContent = qs.total || 0;
                document.getElementById('qsStreak').textContent = qs.streak || 0;
                loadXPMini();
                if (correct && qs.streak > 0 && qs.streak % 5 === 0) fireConfetti();
            }
        });
    }

    document.getElementById('quizNext').addEventListener('click', loadQuizQuestion);

    // ---- Stats ----
    function loadStats() {
        chrome.runtime.sendMessage({ action: 'getStats' }, response => {
            if (!response?.success) return;
            const s = response.stats;
            animateCounter('statTotal', s.total || 0);
            animateCounter('statUnique', s.unique || 0);
            animateCounter('statStreak', s.streak || 0);
            animateCounter('statBest', s.bestStreak || 0);
            renderActivityChart(s.daily || {});
            renderBadges(s.allBadges || []);
            loadFavoritesList();
        });
        loadVocabStrength();
        loadXPCard();
    }

    function loadVocabStrength() {
        chrome.runtime.sendMessage({ action: 'getVocabStrength' }, response => {
            if (!response?.success) return;
            const score = response.score;
            const circumference = 2 * Math.PI * 42;
            const dasharray = (score / 100) * circumference;
            document.getElementById('strFill').style.strokeDasharray = dasharray + ', ' + circumference;
            document.getElementById('strScore').textContent = score;
            document.getElementById('strGrade').textContent = response.grade;

            const d = response.details || {};
            document.getElementById('strMeta').innerHTML =
                '<div>' + (d.totalWords || 0) + ' words • ' + (d.masteredWords || 0) + ' mastered</div>' +
                '<div>Avg mastery: ' + (d.avgMastery || 0) + '% • ' + (d.xp || 0) + ' XP</div>';
        });
    }

    function loadXPCard() {
        chrome.runtime.sendMessage({ action: 'getXP' }, response => {
            if (!response?.success) return;
            document.getElementById('xpLevel').textContent = response.icon + ' Level ' + response.level + ' — ' + response.title;
            document.getElementById('xpTotal').textContent = response.xp + ' XP';
            document.getElementById('xpFill').style.width = response.progress + '%';
            document.getElementById('xpNext').textContent = response.progress >= 100 ? 'Max Level!' : 'Next: ' + response.nextLevelXP + ' XP';
        });
    }

    function animateCounter(id, target) {
        const el = document.getElementById(id);
        const duration = 600;
        const start = parseInt(el.textContent) || 0;
        if (start === target) { el.textContent = target; return; }
        const startTime = performance.now();
        function step(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(start + (target - start) * eased);
            if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    function renderActivityChart(daily) {
        const chart = document.getElementById('activityChart');
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const today = new Date();
        let maxCount = 1;
        const data = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today); d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            const count = daily[key] || 0;
            if (count > maxCount) maxCount = count;
            data.push({ label: days[d.getDay()], count });
        }
        let html = '';
        data.forEach(d => {
            const height = Math.max(4, (d.count / maxCount) * 55);
            html += '<div class="ww-chart-bar"><div class="ww-chart-fill" style="height:' + height + 'px" title="' + d.count + ' lookups"></div><div class="ww-chart-label">' + d.label + '</div></div>';
        });
        chart.innerHTML = html;
    }

    function renderBadges(allBadges) {
        const grid = document.getElementById('badgesGrid');
        if (!allBadges.length) { grid.innerHTML = '<div class="ww-empty-state">Keep looking up words to earn badges!</div>'; return; }
        let html = '';
        allBadges.forEach(b => {
            html += '<div class="ww-badge ' + (b.earned ? 'earned' : 'locked') + '">';
            html += '<div class="ww-badge-icon">' + (b.icon || '🏅') + '</div>';
            html += '<div class="ww-badge-name">' + esc(b.name) + '</div>';
            html += '<div class="ww-badge-desc">' + esc(b.desc) + '</div></div>';
        });
        grid.innerHTML = html;
    }

    function loadFavoritesList() {
        chrome.runtime.sendMessage({ action: 'getFavorites' }, response => {
            const list = document.getElementById('favoritesList');
            const countEl = document.getElementById('favCount');
            if (!response?.success || !response.favorites.length) {
                list.innerHTML = '<div class="ww-empty-state">No favorites yet. Click ♡ on any word!</div>';
                countEl.textContent = '0'; return;
            }
            countEl.textContent = response.favorites.length;
            let html = '';
            response.favorites.forEach(f => {
                html += '<div class="ww-fav-item"><span class="ww-fav-word">' + esc(f.word) + '</span><span class="ww-fav-def">' + esc(f.definition) + '</span></div>';
            });
            list.innerHTML = html;
        });
    }

    // ---- Settings ----
    function loadSettings() {
        chrome.runtime.sendMessage({ action: 'getSettings' }, response => {
            if (!response?.success) return;
            const s = response.settings;
            document.getElementById('settingLang').value = s.lang || 'hi';
            document.getElementById('settingSound').checked = s.sound !== false;
            document.getElementById('settingReminders').checked = s.reminders !== false;
            document.getElementById('goalValue').textContent = s.dailyGoal || 5;

            // Theme picker
            document.querySelectorAll('.ww-theme-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.theme === (s.theme || 'dark'));
            });
        });
    }

    // Theme picker
    document.querySelectorAll('.ww-theme-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.ww-theme-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const theme = this.dataset.theme;
            document.body.className = '';
            if (theme !== 'dark') document.body.classList.add('theme-' + theme);
            chrome.runtime.sendMessage({ action: 'saveSettings', settings: { theme } });
        });
    });

    document.getElementById('settingLang').addEventListener('change', function () {
        chrome.runtime.sendMessage({ action: 'saveSettings', settings: { lang: this.value } });
    });
    document.getElementById('settingSound').addEventListener('change', function () {
        chrome.runtime.sendMessage({ action: 'saveSettings', settings: { sound: this.checked } });
    });
    document.getElementById('settingReminders').addEventListener('change', function () {
        chrome.runtime.sendMessage({ action: 'saveSettings', settings: { reminders: this.checked } });
    });

    // Daily goal adjuster
    document.getElementById('goalUp').addEventListener('click', () => adjustGoal(1));
    document.getElementById('goalDown').addEventListener('click', () => adjustGoal(-1));

    function adjustGoal(delta) {
        const el = document.getElementById('goalValue');
        let val = parseInt(el.textContent) || 5;
        val = Math.max(1, Math.min(50, val + delta));
        el.textContent = val;
        chrome.runtime.sendMessage({ action: 'saveSettings', settings: { dailyGoal: val } }, () => loadDailyGoal());
    }

    // Export
    document.getElementById('exportBtn').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'exportCSV' }, response => {
            if (!response?.success || !response.csv) { alert('No vocabulary data to export yet!'); return; }
            const blob = new Blob([response.csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url;
            a.download = 'wordwise-vocabulary-' + new Date().toISOString().split('T')[0] + '.csv';
            a.click(); URL.revokeObjectURL(url);
        });
    });

    // Reset
    document.getElementById('resetBtn').addEventListener('click', () => {
        if (confirm('⚠️ This will permanently delete ALL data including XP and badges. Are you sure?')) {
            chrome.storage.local.clear(() => {
                chrome.runtime.sendMessage({ action: 'saveSettings', settings: { lang: 'hi', sound: true, dailyGoal: 5, theme: 'dark', reminders: true } });
                loadHistory(); loadStreak(); loadDailyGoal(); loadXPMini();
                alert('All data has been reset.');
            });
        }
    });

    // ---- Confetti ----
    function fireConfetti() {
        const canvas = document.getElementById('confettiCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = 390; canvas.height = 580;
        const particles = [];
        const colors = ['#6C3CE1', '#4F8FFF', '#4ade80', '#fbbf24', '#f87171', '#c4b5fd', '#93bbff'];

        for (let i = 0; i < 60; i++) {
            particles.push({
                x: Math.random() * canvas.width, y: Math.random() * -canvas.height,
                w: Math.random() * 8 + 4, h: Math.random() * 4 + 2,
                vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3 + 2,
                rot: Math.random() * 360, rotV: (Math.random() - 0.5) * 10,
                color: colors[Math.floor(Math.random() * colors.length)], opacity: 1
            });
        }

        let frame = 0;
        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let active = false;
            particles.forEach(p => {
                if (p.opacity <= 0) return;
                active = true;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot * Math.PI / 180);
                ctx.globalAlpha = p.opacity;
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
                p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.rot += p.rotV;
                if (frame > 40) p.opacity -= 0.02;
            });
            frame++;
            if (active && frame < 120) requestAnimationFrame(draw);
            else ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        requestAnimationFrame(draw);
    }

    // ---- Audio ----
    function playAudio(url, word) {
        try { window.speechSynthesis.cancel(); } catch (e) { }
        if (url) {
            const audio = new Audio(url);
            audio.volume = 0.7;
            audio.play().catch(() => speakWord(word));
        } else { speakWord(word); }
    }

    function speakWord(word) {
        if (!word || !window.speechSynthesis) return;
        const u = new SpeechSynthesisUtterance(word);
        u.lang = 'en-US'; u.rate = 0.9; u.pitch = 1; u.volume = 0.8;
        window.speechSynthesis.speak(u);
    }

    function esc(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }
});
