# WordWise — Chrome Extension

A Chrome extension that helps you build your vocabulary while browsing the web. Select any word to get its definition, pronunciation, etymology, and more — all in a clean tooltip without leaving the page.

I built this because I was tired of opening a new tab every time I came across an unfamiliar word. WordWise keeps everything in context and tracks your learning progress over time.

---

## What It Does

**Core Features**
- Select any word on a webpage to see its definition in a tooltip
- Right-click context menu and keyboard shortcut (Ctrl+Shift+D)
- Phonetics, part of speech, synonyms, antonyms, usage examples
- Word etymology / origin when available
- Auto-translation to 12+ languages

**Learning Tools**
- Flashcards with spaced repetition (SM-2 algorithm)
- Four quiz modes: Definition, Reverse, Fill-in-Blank, and Spelling
- Per-word mastery tracking (0-100%)
- Daily word goals with progress tracking

**Gamification**
- XP system with 10 levels (Novice through Word Wizard)
- 12 unlockable badges
- Streak tracking and activity charts
- Vocabulary Strength score

**Customization**
- Three themes: Dark, Midnight Blue, AMOLED Black
- Configurable daily goals (1-50 words)
- Study reminder notifications
- CSV export for Anki/Quizlet import

---

## Installation

1. Clone or download this repo
2. Open `chrome://extensions` in Chrome
3. Turn on **Developer mode** (top right toggle)
4. Click **Load unpacked** and select the project folder

---

## How It Works

The extension uses a content script that listens for text selection on web pages. When you select a word, it sends a message to the background service worker, which fetches the definition from the [Free Dictionary API](https://dictionaryapi.dev/) and translation from [MyMemory API](https://mymemory.translated.net/). The response is displayed in a styled tooltip injected into the page.

All vocabulary data, stats, and settings are stored locally using `chrome.storage.local`. Nothing is sent to any server — your data stays on your machine.

---

## Tech Stack

- Manifest V3 Chrome Extension
- Vanilla JavaScript (no frameworks, no build step)
- Free Dictionary API for definitions
- MyMemory API for translations (no API key needed)
- Web Speech API for pronunciation
- Chrome Storage API for persistence
- Chrome Alarms API for study reminders

---

## Project Structure

```
WordWise/
├── manifest.json          # Extension configuration
├── background.js          # Service worker — handles API calls, data management,
│                          #   quiz engine, XP system, spaced repetition
├── content.js             # Content script — tooltip rendering on web pages
├── content.css            # Tooltip styles
├── popup.html             # Popup UI layout (5 tabs)
├── popup.css              # Popup styles with theme support
├── popup.js               # Popup interactions and state management
├── data/
│   └── common-words.js    # Word frequency lists for difficulty classification
├── icons/                 # Extension icons (16, 48, 128px)
├── .gitignore
└── README.md
```

---

## Screenshots

_Coming soon_

---

## Contributing

This is a personal project, but feel free to fork it and make it your own. If you find a bug or have a suggestion, open an issue.

---

## License

MIT
