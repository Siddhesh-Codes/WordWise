// ============================================================
// WordWise v2.2 — Service Worker (Background Script)
// Handles: API, vocabulary DB, stats, XP/levels, mastery,
//          etymology, quiz modes, SR flashcards, context menu,
//          WotD, translation, export, gamification, reminders
// ============================================================

importScripts('data/common-words.js');

const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const TRANSLATE_API = 'https://api.mymemory.translated.net/get';
const CACHE_MAX = 80;
const HISTORY_MAX = 30;

// In-memory cache
const wordCache = new Map();

// XP rewards
const XP_LOOKUP = 10;
const XP_QUIZ_CORRECT = 25;
const XP_QUIZ_WRONG = 5;
const XP_FLASHCARD = 15;
const XP_STREAK_BONUS = 50; // per day of streak

// Level thresholds
const LEVELS = [
    { level: 1, title: 'Novice', xp: 0, icon: '🌱' },
    { level: 2, title: 'Curious', xp: 100, icon: '🔍' },
    { level: 3, title: 'Learner', xp: 300, icon: '📖' },
    { level: 4, title: 'Explorer', xp: 600, icon: '🧭' },
    { level: 5, title: 'Word Smith', xp: 1000, icon: '🔨' },
    { level: 6, title: 'Linguist', xp: 1500, icon: '🗣️' },
    { level: 7, title: 'Scholar', xp: 2500, icon: '🎓' },
    { level: 8, title: 'Polyglot', xp: 4000, icon: '🌍' },
    { level: 9, title: 'Lexicon Master', xp: 6000, icon: '👑' },
    { level: 10, title: 'Word Wizard', xp: 10000, icon: '🧙' }
];

// ----------------------------------------------------------
// Extension lifecycle — context menu + re-inject + reminders
// ----------------------------------------------------------
chrome.runtime.onInstalled.addListener(async (details) => {
    chrome.contextMenus.create({
        id: 'wordwise-define',
        title: 'Define with WordWise',
        contexts: ['selection']
    });

    // Re-inject content scripts
    try {
        const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
        for (const tab of tabs) {
            try {
                await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
            } catch (e) { }
        }
    } catch (e) { }

    if (details.reason === 'install') {
        await chrome.storage.local.set({
            stats: { total: 0, unique: 0, streak: 0, bestStreak: 0, lastDate: '', daily: {}, badges: [] },
            settings: { lang: 'hi', sound: true, dailyGoal: 5, theme: 'dark', reminders: true, reminderInterval: 120 },
            xp: { total: 0, level: 1 },
            quizStats: { total: 0, correct: 0, streak: 0, bestStreak: 0 },
            onboarded: false
        });
    }

    // Setup study reminder alarm
    setupReminder();
});

// Setup/reset reminder alarm
async function setupReminder() {
    try {
        await chrome.alarms.clear('study-reminder');
        const result = await chrome.storage.local.get({ settings: { reminders: true, reminderInterval: 120 } });
        if (result.settings.reminders) {
            chrome.alarms.create('study-reminder', { periodInMinutes: result.settings.reminderInterval || 120 });
        }
    } catch (e) { }
}

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'study-reminder') {
        try {
            const result = await chrome.storage.local.get({ vocabulary: {}, stats: {} });
            const wordCount = Object.keys(result.vocabulary).length;
            const unreviewedCount = Object.values(result.vocabulary).filter(v => !v.learned && (!v.srNext || v.srNext <= Date.now())).length;

            if (wordCount > 0) {
                // Use chrome.action to show badge
                chrome.action.setBadgeText({ text: String(unreviewedCount || '!') });
                chrome.action.setBadgeBackgroundColor({ color: '#6C3CE1' });

                // Clear badge after 30 minutes
                setTimeout(() => { try { chrome.action.setBadgeText({ text: '' }); } catch (e) { } }, 30 * 60 * 1000);
            }
        } catch (e) { }
    }
});

// Context menu
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'wordwise-define' && info.selectionText) {
        const word = info.selectionText.trim();
        if (word && tab.id) {
            chrome.tabs.sendMessage(tab.id, { action: 'defineWord', word }).catch(() => { });
        }
    }
});

// Keyboard shortcut
chrome.commands.onCommand.addListener((command, tab) => {
    if (command === 'define-word' && tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'defineSelectedWord' }).catch(() => { });
    }
});

// ----------------------------------------------------------
// Message listener
// ----------------------------------------------------------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'lookup':
            handleLookup(request.word, request.context).then(sendResponse);
            return true;
        case 'toggleFavorite':
            toggleFavorite(request.word).then(sendResponse);
            return true;
        case 'getHistory':
            getHistory().then(sendResponse);
            return true;
        case 'clearHistory':
            clearHistory().then(sendResponse);
            return true;
        case 'getStats':
            getStats().then(sendResponse);
            return true;
        case 'getFlashcard':
            getFlashcard().then(sendResponse);
            return true;
        case 'markFlashcard':
            markFlashcardSR(request.word, request.quality).then(sendResponse);
            return true;
        case 'getWordOfDay':
            getWordOfDay().then(sendResponse);
            return true;
        case 'exportCSV':
            exportCSV().then(sendResponse);
            return true;
        case 'getSettings':
            getSettings().then(sendResponse);
            return true;
        case 'saveSettings':
            saveSettings(request.settings).then(r => { setupReminder(); sendResponse(r); });
            return true;
        case 'translate':
            translateWord(request.word, request.lang).then(sendResponse);
            return true;
        case 'getFavorites':
            getFavorites().then(sendResponse);
            return true;
        case 'getQuizQuestion':
            getQuizQuestion(request.quizType).then(sendResponse);
            return true;
        case 'submitQuizAnswer':
            submitQuizAnswer(request.word, request.correct).then(sendResponse);
            return true;
        case 'getQuizStats':
            getQuizStats().then(sendResponse);
            return true;
        case 'getDailyGoal':
            getDailyGoal().then(sendResponse);
            return true;
        case 'getXP':
            getXP().then(sendResponse);
            return true;
        case 'getVocabStrength':
            getVocabStrength().then(sendResponse);
            return true;
        case 'getOnboarded':
            getOnboarded().then(sendResponse);
            return true;
        case 'setOnboarded':
            setOnboarded().then(sendResponse);
            return true;
    }
});

// ----------------------------------------------------------
// XP System
// ----------------------------------------------------------
async function addXP(amount) {
    try {
        const result = await chrome.storage.local.get({ xp: { total: 0, level: 1 } });
        const xp = result.xp;
        const oldLevel = xp.level;
        xp.total = (xp.total || 0) + amount;

        // Calculate level
        let newLevel = 1;
        for (const l of LEVELS) {
            if (xp.total >= l.xp) newLevel = l.level;
        }
        xp.level = newLevel;

        await chrome.storage.local.set({ xp });
        return { leveledUp: newLevel > oldLevel, level: newLevel, total: xp.total };
    } catch (e) {
        return { leveledUp: false, level: 1, total: 0 };
    }
}

async function getXP() {
    try {
        const result = await chrome.storage.local.get({ xp: { total: 0, level: 1 } });
        const xp = result.xp;
        const currentLevel = LEVELS.find(l => l.level === xp.level) || LEVELS[0];
        const nextLevel = LEVELS.find(l => l.level === xp.level + 1);

        return {
            success: true,
            xp: xp.total,
            level: xp.level,
            title: currentLevel.title,
            icon: currentLevel.icon,
            currentLevelXP: currentLevel.xp,
            nextLevelXP: nextLevel ? nextLevel.xp : currentLevel.xp,
            progress: nextLevel
                ? Math.round(((xp.total - currentLevel.xp) / (nextLevel.xp - currentLevel.xp)) * 100)
                : 100,
            allLevels: LEVELS
        };
    } catch (e) {
        return { success: false };
    }
}

// ----------------------------------------------------------
// Onboarding
// ----------------------------------------------------------
async function getOnboarded() {
    const result = await chrome.storage.local.get({ onboarded: false });
    return { success: true, onboarded: result.onboarded };
}
async function setOnboarded() {
    await chrome.storage.local.set({ onboarded: true });
    return { success: true };
}

// ----------------------------------------------------------
// Vocabulary strength score
// ----------------------------------------------------------
async function getVocabStrength() {
    try {
        const result = await chrome.storage.local.get({ vocabulary: {}, stats: {}, xp: { total: 0 } });
        const vocab = result.vocabulary;
        const stats = result.stats || {};
        const words = Object.values(vocab);
        const total = words.length;

        if (total === 0) return { success: true, score: 0, grade: 'Start Learning!', details: {} };

        // Calculate mastery distribution
        let masterySum = 0;
        let masteredCount = 0;
        words.forEach(w => {
            const m = calcMastery(w);
            masterySum += m;
            if (m >= 80) masteredCount++;
        });

        const avgMastery = masterySum / total;
        const streakFactor = Math.min(30, stats.streak || 0) / 30; // max 30 days
        const volumeFactor = Math.min(1, total / 200); // normalize to 200 words
        const masteredFactor = total > 0 ? masteredCount / total : 0;

        // Weighted score: mastery 40%, streak 20%, volume 20%, mastered% 20%
        const score = Math.round(avgMastery * 0.4 + streakFactor * 100 * 0.2 + volumeFactor * 100 * 0.2 + masteredFactor * 100 * 0.2);

        const grades = [
            { min: 90, g: 'Legendary 🏆' }, { min: 75, g: 'Outstanding 🌟' },
            { min: 60, g: 'Strong 💪' }, { min: 40, g: 'Growing 🌱' },
            { min: 20, g: 'Building 🧱' }, { min: 0, g: 'Getting Started 🚀' }
        ];
        const grade = grades.find(g => score >= g.min)?.g || 'Getting Started 🚀';

        return {
            success: true, score, grade,
            details: {
                totalWords: total, masteredWords: masteredCount,
                avgMastery: Math.round(avgMastery),
                streak: stats.streak || 0, xp: result.xp.total
            }
        };
    } catch (e) {
        return { success: false, score: 0, grade: 'Error' };
    }
}

// Calculate mastery for a single word (0-100)
function calcMastery(v) {
    let m = 0;
    // Base: looked up = 10
    m += Math.min(20, (v.cnt || 0) * 5);
    // SR ease factor contribution (1.3-3.0 range → 0-30)
    if (v.srEase) m += Math.min(30, Math.round((v.srEase - 1.3) / 1.7 * 30));
    // SR interval contribution (longer = better, max 30)
    if (v.srInt) m += Math.min(30, Math.round(v.srInt / 60 * 30));
    // Quiz correct answers (max 20)
    if (v.quizCorrect) m += Math.min(20, v.quizCorrect * 10);
    // Learned flag = guaranteed 80+
    if (v.learned) m = Math.max(m, 80);
    return Math.min(100, m);
}

// ----------------------------------------------------------
// Core lookup function (with etymology + translation)
// ----------------------------------------------------------
async function handleLookup(rawWord, context) {
    const word = rawWord.trim().toLowerCase();
    if (!word || word.length < 1 || word.length > 50) {
        return { success: false, error: 'Please select a valid word.' };
    }

    // Cache hit
    if (wordCache.has(word)) {
        const cached = wordCache.get(word);
        await updateVocabulary(cached, context);
        await updateStats();
        const xpResult = await addXP(XP_LOOKUP);
        const translation = await getAutoTranslation(word);
        return { success: true, data: { ...cached, translation }, xp: xpResult };
    }

    try {
        const response = await fetch(`${API_BASE}${encodeURIComponent(word)}`);
        if (!response.ok) {
            if (response.status === 404) return { success: false, error: `No definition found for "${word}".` };
            return { success: false, error: 'Dictionary service is temporarily unavailable.' };
        }

        const json = await response.json();
        const parsed = parseApiResponse(json, word);

        // Cache
        if (wordCache.size >= CACHE_MAX) {
            const firstKey = wordCache.keys().next().value;
            wordCache.delete(firstKey);
        }
        wordCache.set(word, parsed);

        await updateVocabulary(parsed, context);
        await updateStats();
        const xpResult = await addXP(XP_LOOKUP);
        const translation = await getAutoTranslation(word);

        return { success: true, data: { ...parsed, translation }, xp: xpResult };
    } catch (err) {
        return { success: false, error: 'Network error. Please check your connection.' };
    }
}

// Auto-translation helper
async function getAutoTranslation(word) {
    try {
        const result = await chrome.storage.local.get({ settings: { lang: 'hi' } });
        const lang = result.settings.lang || 'hi';
        if (lang === 'en') return null;
        const resp = await fetch(`${TRANSLATE_API}?q=${encodeURIComponent(word)}&langpair=en|${lang}`);
        const data = await resp.json();
        if (data.responseStatus === 200 && data.responseData) return data.responseData.translatedText;
    } catch (e) { }
    return null;
}

// ----------------------------------------------------------
// Parse API response (with etymology extraction)
// ----------------------------------------------------------
function parseApiResponse(json, word) {
    const entry = json[0];
    let phonetic = entry.phonetic || '';
    let audioUrl = '';

    if (entry.phonetics && entry.phonetics.length > 0) {
        const withAudio = entry.phonetics.find(p => p.audio && p.audio.length > 0);
        if (withAudio) { phonetic = withAudio.text || phonetic; audioUrl = withAudio.audio; }
        else { phonetic = entry.phonetics[0].text || phonetic; }
    }

    const meanings = [];
    const allExamples = [];
    const allSynonyms = new Set();
    const allAntonyms = new Set();

    for (const meaning of entry.meanings || []) {
        const partOfSpeech = meaning.partOfSpeech || '';
        const definitions = [];
        for (const def of meaning.definitions || []) {
            definitions.push({ definition: def.definition || '', example: def.example || '' });
            if (def.example) allExamples.push(def.example);
        }
        for (const s of meaning.synonyms || []) allSynonyms.add(s);
        for (const a of meaning.antonyms || []) allAntonyms.add(a);
        for (const def of meaning.definitions || []) {
            for (const s of def.synonyms || []) allSynonyms.add(s);
            for (const a of def.antonyms || []) allAntonyms.add(a);
        }
        meanings.push({ partOfSpeech, definitions });
    }

    const primaryMeaning = meanings[0] || { partOfSpeech: '', definitions: [{ definition: 'No definition available.', example: '' }] };
    const primaryDef = primaryMeaning.definitions[0]?.definition || 'No definition available.';
    const examples = allExamples.slice(0, 2);

    // Difficulty
    const lowerWord = (entry.word || word).toLowerCase();
    let difficulty = 'advanced';
    if (COMMON_WORDS.has(lowerWord)) difficulty = 'common';
    else if (INTERMEDIATE_WORDS.has(lowerWord)) difficulty = 'intermediate';

    // Etymology extraction
    let etymology = '';
    if (entry.origin) {
        etymology = entry.origin;
    }
    // Some API responses have etymology in sourceUrls or in phonetics description
    // The free dictionary API puts origin at entry level

    return {
        word: entry.word || word,
        phonetic, audioUrl,
        partOfSpeech: primaryMeaning.partOfSpeech,
        definition: primaryDef,
        examples, meanings,
        synonyms: [...allSynonyms].slice(0, 5),
        antonyms: [...allAntonyms].slice(0, 3),
        sourceUrl: entry.sourceUrls?.[0] || '',
        difficulty, etymology,
        timestamp: Date.now()
    };
}

// ----------------------------------------------------------
// Vocabulary Database (with mastery fields)
// ----------------------------------------------------------
async function updateVocabulary(wordData, context) {
    try {
        const result = await chrome.storage.local.get({ vocabulary: {} });
        const vocab = result.vocabulary;
        const key = wordData.word.toLowerCase();

        if (vocab[key]) {
            vocab[key].cnt = (vocab[key].cnt || 0) + 1;
            vocab[key].last = Date.now();
            // Update etymology if we got it now but didn't have it
            if (wordData.etymology && !vocab[key].ety) vocab[key].ety = wordData.etymology;
            if (context && context.sentence) {
                if (!vocab[key].ctx) vocab[key].ctx = [];
                vocab[key].ctx.unshift({ s: context.sentence, u: context.url, d: Date.now() });
                if (vocab[key].ctx.length > 3) vocab[key].ctx = vocab[key].ctx.slice(0, 3);
            }
        } else {
            vocab[key] = {
                w: wordData.word, ph: wordData.phonetic, ps: wordData.partOfSpeech,
                def: wordData.definition, ex: wordData.examples,
                syn: wordData.synonyms, ant: wordData.antonyms,
                au: wordData.audioUrl, src: wordData.sourceUrl,
                diff: wordData.difficulty, ety: wordData.etymology || '',
                cnt: 1, first: Date.now(), last: Date.now(),
                fav: false, learned: false, quizCorrect: 0,
                srEase: 2.5, srInt: 0, srNext: 0,
                ctx: context && context.sentence ? [{ s: context.sentence, u: context.url, d: Date.now() }] : []
            };
        }
        await chrome.storage.local.set({ vocabulary: vocab });
    } catch (err) {
        console.error('WordWise: Failed to update vocabulary', err);
    }
}

// ----------------------------------------------------------
// Stats Engine & Gamification
// ----------------------------------------------------------
const BADGES = {
    'first-lookup': { name: 'First Steps', icon: '🌱', desc: 'Looked up your first word', req: s => s.total >= 1 },
    'word-collector': { name: 'Word Collector', icon: '📚', desc: 'Looked up 50 words', req: s => s.total >= 50 },
    'vocabulary-builder': { name: 'Vocabulary Builder', icon: '🏗️', desc: '100 unique words', req: s => s.unique >= 100 },
    'polyglot': { name: 'Polyglot', icon: '🌍', desc: '250 unique words', req: s => s.unique >= 250 },
    'scholar': { name: 'Scholar', icon: '🎓', desc: '500 unique words', req: s => s.unique >= 500 },
    'streak-3': { name: 'On Fire', icon: '🔥', desc: '3-day streak', req: s => s.streak >= 3 },
    'streak-7': { name: 'Streak Master', icon: '⚡', desc: '7-day streak', req: s => s.streak >= 7 },
    'streak-30': { name: 'Unstoppable', icon: '💎', desc: '30-day streak', req: s => s.streak >= 30 },
    'bookworm': { name: 'Bookworm', icon: '🐛', desc: '1000 total lookups', req: s => s.total >= 1000 },
    'quiz-master': { name: 'Quiz Master', icon: '🧠', desc: '50 correct quiz answers', req: s => (s.quizCorrect || 0) >= 50 },
    'perfectionist': { name: 'Perfectionist', icon: '💯', desc: '10 quiz streak', req: s => (s.quizBestStreak || 0) >= 10 },
    'etymologist': { name: 'Etymologist', icon: '🏛️', desc: 'Discovered 20 word origins', req: s => (s.etymCount || 0) >= 20 }
};

async function updateStats() {
    try {
        const result = await chrome.storage.local.get({ stats: {}, vocabulary: {} });
        const stats = result.stats || { total: 0, unique: 0, streak: 0, bestStreak: 0, lastDate: '', daily: {}, badges: [] };
        const vocab = result.vocabulary || {};
        const today = new Date().toISOString().split('T')[0];

        stats.total = (stats.total || 0) + 1;
        stats.unique = Object.keys(vocab).length;

        // Daily count
        if (!stats.daily) stats.daily = {};
        stats.daily[today] = (stats.daily[today] || 0) + 1;

        // Clean old daily (keep 30 days)
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);
        const cutoff = cutoffDate.toISOString().split('T')[0];
        for (const date in stats.daily) { if (date < cutoff) delete stats.daily[date]; }

        // Streak
        if (stats.lastDate !== today) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            stats.streak = stats.lastDate === yesterdayStr ? (stats.streak || 0) + 1 : 1;
            stats.lastDate = today;
        }
        if (stats.streak > (stats.bestStreak || 0)) stats.bestStreak = stats.streak;

        // Etymology count
        let etyCount = 0;
        for (const k in vocab) { if (vocab[k].ety) etyCount++; }
        stats.etymCount = etyCount;

        // Badges
        if (!stats.badges) stats.badges = [];
        for (const [id, badge] of Object.entries(BADGES)) {
            if (!stats.badges.includes(id) && badge.req(stats)) stats.badges.push(id);
        }

        await chrome.storage.local.set({ stats });
    } catch (err) {
        console.error('WordWise: Failed to update stats', err);
    }
}

async function getStats() {
    try {
        const result = await chrome.storage.local.get({ stats: {}, vocabulary: {} });
        const stats = result.stats || {};
        const vocab = result.vocabulary || {};

        const badgeDetails = (stats.badges || []).map(id => ({ id, ...BADGES[id] }));
        let favCount = 0, learnedCount = 0;
        for (const key in vocab) {
            if (vocab[key].fav) favCount++;
            if (vocab[key].learned) learnedCount++;
        }

        return {
            success: true,
            stats: {
                ...stats,
                unique: Object.keys(vocab).length,
                badgeDetails,
                allBadges: Object.entries(BADGES).map(([id, b]) => ({ id, ...b, earned: (stats.badges || []).includes(id) })),
                favorites: favCount,
                learned: learnedCount
            }
        };
    } catch (err) {
        return { success: false };
    }
}

// ----------------------------------------------------------
// Favorites
// ----------------------------------------------------------
async function toggleFavorite(word) {
    try {
        const result = await chrome.storage.local.get({ vocabulary: {} });
        const vocab = result.vocabulary;
        const key = word.toLowerCase();
        if (vocab[key]) {
            vocab[key].fav = !vocab[key].fav;
            await chrome.storage.local.set({ vocabulary: vocab });
            return { success: true, isFavorite: vocab[key].fav };
        }
        return { success: false };
    } catch (err) { return { success: false }; }
}

async function getFavorites() {
    try {
        const result = await chrome.storage.local.get({ vocabulary: {} });
        const vocab = result.vocabulary;
        const favorites = [];
        for (const key in vocab) {
            if (vocab[key].fav) {
                favorites.push({ word: vocab[key].w, definition: vocab[key].def, partOfSpeech: vocab[key].ps, difficulty: vocab[key].diff });
            }
        }
        return { success: true, favorites };
    } catch (err) { return { success: false, favorites: [] }; }
}

// ----------------------------------------------------------
// Flashcards with SM-2 Spaced Repetition
// ----------------------------------------------------------
async function getFlashcard() {
    try {
        const result = await chrome.storage.local.get({ vocabulary: {} });
        const vocab = result.vocabulary;
        const now = Date.now();
        const words = Object.values(vocab).filter(v => {
            if (v.learned) return false;
            if (!v.srNext) return true;
            return v.srNext <= now;
        });

        if (words.length === 0) {
            const allWords = Object.values(vocab).filter(v => !v.learned);
            if (allWords.length > 0) {
                const pick = allWords[Math.floor(Math.random() * allWords.length)];
                return { success: true, card: formatCard(pick), reviewsDone: true };
            }
            return { success: false, error: 'No words to study! Look up some words first.' };
        }

        words.sort((a, b) => {
            const aOverdue = a.srNext ? Math.max(0, now - a.srNext) : Infinity;
            const bOverdue = b.srNext ? Math.max(0, now - b.srNext) : Infinity;
            return bOverdue - aOverdue;
        });

        return { success: true, card: formatCard(words[0]) };
    } catch (err) {
        return { success: false, error: 'Failed to load flashcard.' };
    }
}

function formatCard(v) {
    return {
        word: v.w, phonetic: v.ph, partOfSpeech: v.ps,
        definition: v.def, examples: v.ex || [],
        difficulty: v.diff, lookupCount: v.cnt,
        isFavorite: v.fav, etymology: v.ety || '',
        ease: v.srEase || 2.5, interval: v.srInt || 0,
        mastery: calcMastery(v)
    };
}

async function markFlashcardSR(word, quality) {
    try {
        const result = await chrome.storage.local.get({ vocabulary: {} });
        const vocab = result.vocabulary;
        const key = word.toLowerCase();

        if (vocab[key]) {
            let ease = vocab[key].srEase || 2.5;
            let interval = vocab[key].srInt || 0;
            const q = typeof quality === 'number' ? quality : 2;

            if (q === 0) { interval = 1; ease = Math.max(1.3, ease - 0.2); }
            else if (q === 1) { interval = Math.max(1, Math.round(interval * 1.2)); ease = Math.max(1.3, ease - 0.15); }
            else if (q === 2) { interval = interval === 0 ? 1 : interval === 1 ? 6 : Math.round(interval * ease); }
            else { interval = interval === 0 ? 4 : Math.round(interval * ease * 1.3); ease += 0.15; if (interval >= 60) vocab[key].learned = true; }

            vocab[key].srEase = ease;
            vocab[key].srInt = interval;
            vocab[key].srNext = Date.now() + interval * 60 * 1000;
            await chrome.storage.local.set({ vocabulary: vocab });
        }

        await addXP(XP_FLASHCARD);
        return { success: true };
    } catch (err) { return { success: false }; }
}

// ----------------------------------------------------------
// Word of the Day
// ----------------------------------------------------------
const WOTD_POOL = [
    'serendipity', 'ephemeral', 'quintessential', 'ubiquitous', 'eloquent',
    'resilient', 'enigma', 'paradigm', 'aesthetic', 'altruistic',
    'cacophony', 'diligent', 'ebullient', 'fortuitous', 'gregarious',
    'harbinger', 'idiosyncratic', 'juxtapose', 'kinetic', 'luminous',
    'melancholy', 'nonchalant', 'omniscient', 'perspicacious', 'quixotic',
    'sagacious', 'tenacious', 'voracious', 'whimsical', 'zealous',
    'abstruse', 'benevolent', 'conundrum', 'discernment', 'effervescent',
    'fastidious', 'gratuitous', 'hyperbole', 'impetuous', 'judicious',
    'kaleidoscope', 'labyrinthine', 'magnanimous', 'nebulous', 'ostentatious',
    'panacea', 'recalcitrant', 'surreptitious', 'trepidation', 'unequivocal',
    'vicissitude', 'wanderlust', 'xenial', 'yearning', 'zenith',
    'ambivalent', 'bombastic', 'circumspect', 'debonair', 'esoteric',
    'flamboyant', 'garrulous', 'hapless', 'ineffable', 'juxtaposition'
];

async function getWordOfDay() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const dayIndex = today.split('-').reduce((sum, n) => sum + parseInt(n), 0);
        const word = WOTD_POOL[dayIndex % WOTD_POOL.length];

        if (wordCache.has(word)) return { success: true, data: wordCache.get(word) };

        const response = await fetch(`${API_BASE}${encodeURIComponent(word)}`);
        if (response.ok) {
            const json = await response.json();
            const parsed = parseApiResponse(json, word);
            wordCache.set(word, parsed);
            return { success: true, data: parsed };
        }
        return { success: false, error: 'Could not load Word of the Day.' };
    } catch (err) { return { success: false, error: 'Network error.' }; }
}

// ----------------------------------------------------------
// Translation
// ----------------------------------------------------------
async function translateWord(word, targetLang) {
    if (!word || !targetLang || targetLang === 'en') return { success: false };
    try {
        const url = `${TRANSLATE_API}?q=${encodeURIComponent(word)}&langpair=en|${targetLang}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.responseStatus === 200 && data.responseData) return { success: true, translation: data.responseData.translatedText };
        return { success: false };
    } catch (err) { return { success: false }; }
}

// ----------------------------------------------------------
// Export CSV
// ----------------------------------------------------------
async function exportCSV() {
    try {
        const result = await chrome.storage.local.get({ vocabulary: {} });
        const vocab = result.vocabulary;
        let csv = 'Word,Part of Speech,Definition,Difficulty,Lookups,Mastery%,Favorite,Learned,Etymology,First Lookup,Synonyms,Antonyms\n';
        for (const key in vocab) {
            const v = vocab[key];
            const row = [
                `"${(v.w || '').replace(/"/g, '""')}"`, `"${v.ps || ''}"`,
                `"${(v.def || '').replace(/"/g, '""')}"`, v.diff || 'unknown',
                v.cnt || 0, calcMastery(v),
                v.fav ? 'Yes' : 'No', v.learned ? 'Yes' : 'No',
                `"${(v.ety || '').replace(/"/g, '""')}"`,
                v.first ? new Date(v.first).toLocaleDateString() : '',
                `"${(v.syn || []).join(', ')}"`, `"${(v.ant || []).join(', ')}"`
            ];
            csv += row.join(',') + '\n';
        }
        return { success: true, csv };
    } catch (err) { return { success: false }; }
}

// ----------------------------------------------------------
// History
// ----------------------------------------------------------
async function getHistory() {
    try {
        const result = await chrome.storage.local.get({ vocabulary: {} });
        const vocab = result.vocabulary;
        const history = Object.values(vocab)
            .sort((a, b) => (b.last || 0) - (a.last || 0))
            .slice(0, HISTORY_MAX)
            .map(v => ({
                word: v.w, phonetic: v.ph, partOfSpeech: v.ps,
                definition: v.def, difficulty: v.diff,
                lookupCount: v.cnt, isFavorite: v.fav,
                mastery: calcMastery(v), timestamp: v.last
            }));
        return { success: true, history };
    } catch (err) { return { success: false, history: [] }; }
}

async function clearHistory() {
    try {
        await chrome.storage.local.set({ vocabulary: {}, stats: { total: 0, unique: 0, streak: 0, bestStreak: 0, lastDate: '', daily: {}, badges: [] } });
        return { success: true };
    } catch (err) { return { success: false }; }
}

// ----------------------------------------------------------
// Settings
// ----------------------------------------------------------
async function getSettings() {
    try {
        const result = await chrome.storage.local.get({ settings: { lang: 'hi', sound: true, dailyGoal: 5, theme: 'dark', reminders: true, reminderInterval: 120 } });
        return { success: true, settings: result.settings };
    } catch (err) {
        return { success: false, settings: { lang: 'hi', sound: true, dailyGoal: 5, theme: 'dark', reminders: true, reminderInterval: 120 } };
    }
}

async function saveSettings(newSettings) {
    try {
        const result = await chrome.storage.local.get({ settings: {} });
        const settings = { ...result.settings, ...newSettings };
        await chrome.storage.local.set({ settings });
        return { success: true };
    } catch (err) { return { success: false }; }
}

// ----------------------------------------------------------
// Quiz Engine (multiple types)
// ----------------------------------------------------------
async function getQuizQuestion(quizType = 'definition') {
    try {
        const result = await chrome.storage.local.get({ vocabulary: {} });
        const vocab = result.vocabulary;
        const words = Object.values(vocab).filter(w => w.def && w.w);

        if (words.length < 4) {
            return { success: false, error: 'Need at least 4 words in vocabulary to start a quiz!' };
        }

        const shuffled = [...words].sort(() => Math.random() - 0.5);
        const correct = shuffled[0];

        if (quizType === 'reverse') {
            // Given definition, pick the word
            const options = [
                { text: correct.w, isCorrect: true },
                ...shuffled.slice(1, 4).map(w => ({ text: w.w, isCorrect: false }))
            ].sort(() => Math.random() - 0.5);

            return {
                success: true,
                question: {
                    type: 'reverse',
                    prompt: 'Which word matches this definition?',
                    clue: correct.def,
                    difficulty: correct.diff,
                    options,
                    answer: correct.w
                }
            };

        } else if (quizType === 'fillblank') {
            // Fill in the blank — use an example sentence
            const wordsWithEx = words.filter(w => w.ex && w.ex.length > 0);
            if (wordsWithEx.length < 4) {
                return getQuizQuestion('definition'); // Fallback
            }
            const fShuffled = [...wordsWithEx].sort(() => Math.random() - 0.5);
            const fCorrect = fShuffled[0];
            const sentence = fCorrect.ex[0];
            const blanked = sentence.replace(new RegExp(fCorrect.w, 'gi'), '______');

            const options = [
                { text: fCorrect.w, isCorrect: true },
                ...fShuffled.slice(1, 4).map(w => ({ text: w.w, isCorrect: false }))
            ].sort(() => Math.random() - 0.5);

            return {
                success: true,
                question: {
                    type: 'fillblank',
                    prompt: 'Fill in the blank:',
                    clue: blanked,
                    difficulty: fCorrect.diff,
                    options,
                    answer: fCorrect.w
                }
            };

        } else if (quizType === 'spelling') {
            // Listen and type the word
            return {
                success: true,
                question: {
                    type: 'spelling',
                    prompt: 'Listen and type the word:',
                    clue: correct.def,
                    word: correct.w,
                    phonetic: correct.ph,
                    audioUrl: correct.au || '',
                    difficulty: correct.diff,
                    answer: correct.w
                }
            };

        } else {
            // Default: definition quiz
            const options = [
                { text: correct.def, isCorrect: true },
                ...shuffled.slice(1, 4).map(w => ({ text: w.def, isCorrect: false }))
            ].sort(() => Math.random() - 0.5);

            return {
                success: true,
                question: {
                    type: 'definition',
                    prompt: 'What does this word mean?',
                    clue: correct.w,
                    phonetic: correct.ph,
                    difficulty: correct.diff,
                    options,
                    answer: correct.def
                }
            };
        }
    } catch (err) {
        return { success: false, error: 'Failed to generate quiz question.' };
    }
}

async function submitQuizAnswer(word, correct) {
    try {
        const result = await chrome.storage.local.get({
            quizStats: { total: 0, correct: 0, streak: 0, bestStreak: 0 },
            vocabulary: {}, stats: {}
        });
        const qs = result.quizStats;
        qs.total = (qs.total || 0) + 1;

        if (correct) {
            qs.correct = (qs.correct || 0) + 1;
            qs.streak = (qs.streak || 0) + 1;
            if (qs.streak > (qs.bestStreak || 0)) qs.bestStreak = qs.streak;
            await addXP(XP_QUIZ_CORRECT);
        } else {
            qs.streak = 0;
            await addXP(XP_QUIZ_WRONG);
        }

        // Update word-level quiz stats for mastery
        const vocab = result.vocabulary;
        const key = (word || '').toLowerCase();
        if (vocab[key] && correct) {
            vocab[key].quizCorrect = (vocab[key].quizCorrect || 0) + 1;
            await chrome.storage.local.set({ vocabulary: vocab });
        }

        // Update stats for badge tracking
        const stats = result.stats || {};
        stats.quizCorrect = (stats.quizCorrect || 0) + (correct ? 1 : 0);
        stats.quizBestStreak = Math.max(stats.quizBestStreak || 0, qs.streak);

        await chrome.storage.local.set({ quizStats: qs, stats });
        return { success: true, quizStats: qs };
    } catch (err) { return { success: false }; }
}

async function getQuizStats() {
    try {
        const result = await chrome.storage.local.get({ quizStats: { total: 0, correct: 0, streak: 0, bestStreak: 0 } });
        return { success: true, quizStats: result.quizStats };
    } catch (err) { return { success: false }; }
}

// ----------------------------------------------------------
// Daily Goal
// ----------------------------------------------------------
async function getDailyGoal() {
    try {
        const result = await chrome.storage.local.get({ settings: { dailyGoal: 5 }, stats: {} });
        const goal = result.settings.dailyGoal || 5;
        const today = new Date().toISOString().split('T')[0];
        const todayCount = (result.stats.daily && result.stats.daily[today]) || 0;
        return {
            success: true, goal,
            progress: todayCount,
            completed: todayCount >= goal,
            percentage: Math.min(100, Math.round((todayCount / goal) * 100))
        };
    } catch (err) { return { success: false, goal: 5, progress: 0, completed: false, percentage: 0 }; }
}
