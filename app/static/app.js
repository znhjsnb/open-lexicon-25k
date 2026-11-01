/**
 * Open-Lexicon 25K Client Application
 * Lightning-fast search, Web Speech audio, Multi-POS visualization
 */

const state = {
    query: "",
    tag: "",
    pos: "",
    page: 1,
    limit: 30,
    totalPages: 1,
    totalWords: 0,
    words: [],
    selectedWord: null,
    bookmarks: JSON.parse(localStorage.getItem("open_lexicon_bookmarks") || "[]"),
    theme: localStorage.getItem("open_lexicon_theme") || "dark"
};

// DOM Elements
const searchInput = document.getElementById("searchInput");
const btnClearSearch = document.getElementById("btnClearSearch");
const wordList = document.getElementById("wordList");
const resultsCount = document.getElementById("resultsCount");
const pageInfo = document.getElementById("pageInfo");
const pageCurrent = document.getElementById("pageCurrent");
const btnPrevPage = document.getElementById("btnPrevPage");
const btnNextPage = document.getElementById("btnNextPage");

const emptyState = document.getElementById("emptyState");
const wordDetail = document.getElementById("wordDetail");
const detailWord = document.getElementById("detailWord");
const detailPhoneticUK = document.getElementById("detailPhoneticUK");
const detailPhoneticUS = document.getElementById("detailPhoneticUS");
const detailExamTags = document.getElementById("detailExamTags");
const detailSenses = document.getElementById("detailSenses");
const sensesCountBadge = document.getElementById("sensesCountBadge");

const etymZh = document.getElementById("etymZh");
const etymEn = document.getElementById("etymEn");
const morphZh = document.getElementById("morphZh");
const morphEn = document.getElementById("morphEn");
const synZh = document.getElementById("synZh");
const synEn = document.getElementById("synEn");
const mnemZh = document.getElementById("mnemZh");
const mnemEn = document.getElementById("mnemEn");

const btnRandom = document.getElementById("btnRandom");
const btnBookmarks = document.getElementById("btnBookmarks");
const bookmarkCount = document.getElementById("bookmarkCount");
const btnTheme = document.getElementById("btnTheme");
const themeIcon = document.getElementById("themeIcon");
const btnAudioUK = document.getElementById("btnAudioUK");
const btnAudioUS = document.getElementById("btnAudioUS");
const btnToggleBookmark = document.getElementById("btnToggleBookmark");
const bookmarkStar = document.getElementById("bookmarkStar");
const btnCopyMarkdown = document.getElementById("btnCopyMarkdown");
const btnCopyAnki = document.getElementById("btnCopyAnki");
const toast = document.getElementById("toast");

// Initialize
document.addEventListener("DOMContentLoaded", () => {
    applyTheme(state.theme);
    updateBookmarkCount();
    bindEvents();
    loadWords(true);
});

function applyTheme(theme) {
    state.theme = theme;
    localStorage.setItem("open_lexicon_theme", theme);
    if (theme === "light") {
        document.body.classList.remove("dark-theme");
        document.body.classList.add("light-theme");
        themeIcon.textContent = "🌙";
    } else {
        document.body.classList.remove("light-theme");
        document.body.classList.add("dark-theme");
        themeIcon.textContent = "☀️";
    }
}

function updateBookmarkCount() {
    bookmarkCount.textContent = state.bookmarks.length;
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.remove("hidden");
    setTimeout(() => {
        toast.classList.add("hidden");
    }, 2000);
}

// Data Fetching
let searchDebounceTimer = null;

async function loadWords(resetPage = false) {
    if (resetPage) {
        state.page = 1;
    }

    const params = new URLSearchParams({
        q: state.query,
        tag: state.tag,
        pos: state.pos,
        page: state.page,
        limit: state.limit
    });

    resultsCount.textContent = "正在检索...";

    try {
        const resp = await fetch(`/api/words?${params}`);
        const data = await resp.json();

        state.words = data.words || [];
        state.totalWords = data.total || 0;
        state.totalPages = data.total_pages || 1;

        resultsCount.textContent = `共找到 ${state.totalWords.toLocaleString()} 词`;
        pageInfo.textContent = `第 ${state.page} / ${state.totalPages} 页`;
        pageCurrent.textContent = `${state.page} / ${state.totalPages}`;

        btnPrevPage.disabled = state.page <= 1;
        btnNextPage.disabled = state.page >= state.totalPages;

        renderWordList();

        // Auto select first word if available and none selected
        if (state.words.length > 0 && !state.selectedWord) {
            selectWord(state.words[0].id);
        }
    } catch (e) {
        resultsCount.textContent = "检索服务连接异常";
        console.error(e);
    }
}

function renderWordList() {
    wordList.innerHTML = "";

    if (state.words.length === 0) {
        wordList.innerHTML = `
            <div style="padding: 24px 16px; text-align: center; color: var(--text-muted); font-size: 13px;">
                没有找到匹配的词汇
            </div>
        `;
        return;
    }

    state.words.forEach(w => {
        const item = document.createElement("div");
        item.className = `word-item ${state.selectedWord && state.selectedWord.id === w.id ? "active" : ""}`;
        item.dataset.id = w.id;

        item.innerHTML = `
            <div class="word-item-left">
                <div class="word-item-row">
                    <span class="word-item-rank">#${w.rank}</span>
                    <span class="word-item-title">${escapeHtml(w.word)}</span>
                    <span class="word-item-phonetic">${escapeHtml(w.phonetic || "")}</span>
                </div>
                <div class="word-item-meaning">${escapeHtml(w.main_meaning || "")}</div>
            </div>
            <span class="word-item-badge">${w.senses_count} 义项</span>
        `;

        item.addEventListener("click", () => selectWord(w.id));
        wordList.appendChild(item);
    });
}

async function selectWord(wordId) {
    // Highlight list item
    document.querySelectorAll(".word-item").forEach(el => {
        el.classList.toggle("active", el.dataset.id == wordId);
    });

    try {
        const resp = await fetch(`/api/word?id=${wordId}`);
        const data = await resp.json();
        state.selectedWord = { ...data, id: wordId };
        renderWordDetail(state.selectedWord);
    } catch (e) {
        console.error("Failed to load word detail:", e);
    }
}

function renderWordDetail(word) {
    emptyState.classList.add("hidden");
    wordDetail.classList.remove("hidden");

    detailWord.textContent = word.word;

    // Phonetics
    const phonetic = word.phonetic || "";
    detailPhoneticUK.textContent = phonetic ? `/${phonetic}/` : "";
    detailPhoneticUS.textContent = phonetic ? `/${phonetic}/` : "";

    // Exam tags
    detailExamTags.innerHTML = (word.exam_tags || [])
        .map(t => `<span class="exam-tag">${escapeHtml(t)}</span>`)
        .join("");

    // Bookmark state
    const isBookmarked = state.bookmarks.includes(word.word.toLowerCase());
    bookmarkStar.textContent = isBookmarked ? "★" : "☆";
    btnToggleBookmark.classList.toggle("active", isBookmarked);

    // Multi-POS Senses
    const senses = word.senses || [];
    sensesCountBadge.textContent = `${senses.length} 个词性义项`;

    detailSenses.innerHTML = senses.map(s => `
        <div class="sense-card">
            <div class="sense-header-line">
                <span class="sense-pos-tag">${escapeHtml(s.pos || "")}</span>
                <span class="sense-zh-def">${escapeHtml(s.meaning_zh || "")}</span>
                <span class="sense-en-def-short">(${escapeHtml(s.meaning_en || "")})</span>
            </div>

            ${s.english_definition ? `
                <div class="cobuild-def">
                    <strong>COBUILD:</strong> ${escapeHtml(s.english_definition)}
                </div>
            ` : ""}

            ${s.collocation_en ? `
                <div class="sense-item-row">
                    <strong>搭配:</strong> 
                    <span class="colloc-code">${escapeHtml(s.collocation_en)}</span>
                    <span class="trans-zh">${escapeHtml(s.collocation_zh || "")}</span>
                    <button class="play-inline" title="朗读搭配" onclick="playAudio('${escapeJs(s.collocation_en)}')">🔊</button>
                </div>
            ` : ""}

            ${s.sentence_en ? `
                <div class="sense-item-row">
                    <strong>例句:</strong>
                    <span class="sentence-en-text">${escapeHtml(s.sentence_en)}</span>
                    <button class="play-inline" title="朗读例句" onclick="playAudio('${escapeJs(s.sentence_en)}')">🔊</button>
                    <span class="sentence-zh-text">${escapeHtml(s.sentence_zh || "")}</span>
                </div>
            ` : ""}
        </div>
    `).join("");

    // Deep Lexical sections
    const etym = word.etymology_story || {};
    etymZh.textContent = etym.zh || "暂无详细词源故事记录。";
    etymEn.textContent = etym.en || "";

    const morph = word.morphology_enriched || {};
    morphZh.textContent = morph.zh || "暂无构词法拆解。";
    morphEn.textContent = morph.en || "";

    const syn = word.synonyms_and_nuances || {};
    synZh.textContent = syn.zh || "暂无近义辨析。";
    synEn.textContent = syn.en || "";

    const mnem = word.mnemonic_anchor || {};
    mnemZh.textContent = mnem.zh || "暂无记忆锚点。";
    mnemEn.textContent = mnem.en || "";
}

// Audio Speech Synthesis
function playAudio(text, lang = "en-US") {
    if (!("speechSynthesis" in window)) {
        alert("当前浏览器不支持语音合成播放");
        return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
}
window.playAudio = playAudio; // Make accessible to inline onclick

// Event Listeners
function bindEvents() {
    // Search input debounced
    searchInput.addEventListener("input", (e) => {
        state.query = e.target.value.trim();
        btnClearSearch.classList.toggle("hidden", !state.query);
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            loadWords(true);
        }, 150);
    });

    btnClearSearch.addEventListener("click", () => {
        searchInput.value = "";
        state.query = "";
        btnClearSearch.classList.add("hidden");
        loadWords(true);
        searchInput.focus();
    });

    // Tag filters
    document.querySelectorAll("#tagFilters .chip").forEach(chip => {
        chip.addEventListener("click", () => {
            document.querySelectorAll("#tagFilters .chip").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            state.tag = chip.dataset.tag;
            loadWords(true);
        });
    });

    // POS filters
    document.querySelectorAll("#posFilters .chip").forEach(chip => {
        chip.addEventListener("click", () => {
            document.querySelectorAll("#posFilters .chip").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            state.pos = chip.dataset.pos;
            loadWords(true);
        });
    });

    // Pagination
    btnPrevPage.addEventListener("click", () => {
        if (state.page > 1) {
            state.page--;
            loadWords();
        }
    });

    btnNextPage.addEventListener("click", () => {
        if (state.page < state.totalPages) {
            state.page++;
            loadWords();
        }
    });

    // Random word
    btnRandom.addEventListener("click", async () => {
        try {
            const resp = await fetch("/api/random");
            const data = await resp.json();
            state.selectedWord = data;
            renderWordDetail(data);
            showToast(`已抽选随机单词: ${data.word}`);
        } catch (e) {
            console.error(e);
        }
    });

    // Bookmarks toggle filter
    let showingBookmarksOnly = false;
    btnBookmarks.addEventListener("click", () => {
        showingBookmarksOnly = !showingBookmarksOnly;
        if (showingBookmarksOnly) {
            if (state.bookmarks.length === 0) {
                showToast("收藏夹当前为空，点击右上角 ☆ 可收藏单词");
                showingBookmarksOnly = false;
                return;
            }
            btnBookmarks.classList.add("active");
            state.query = state.bookmarks[0] || "";
            searchInput.value = state.query;
            loadWords(true);
            showToast("正在展示收藏词汇");
        } else {
            btnBookmarks.classList.remove("active");
            state.query = "";
            searchInput.value = "";
            loadWords(true);
        }
    });

    // Theme toggle
    btnTheme.addEventListener("click", () => {
        const nextTheme = state.theme === "dark" ? "light" : "dark";
        applyTheme(nextTheme);
    });

    // Audio buttons
    btnAudioUK.addEventListener("click", () => {
        if (state.selectedWord) playAudio(state.selectedWord.word, "en-GB");
    });
    btnAudioUS.addEventListener("click", () => {
        if (state.selectedWord) playAudio(state.selectedWord.word, "en-US");
    });

    // Bookmark current word
    btnToggleBookmark.addEventListener("click", () => {
        if (!state.selectedWord) return;
        const w = state.selectedWord.word.toLowerCase();
        const idx = state.bookmarks.indexOf(w);
        if (idx === -1) {
            state.bookmarks.push(w);
            showToast(`已收藏: ${state.selectedWord.word}`);
        } else {
            state.bookmarks.splice(idx, 1);
            showToast(`已取消收藏: ${state.selectedWord.word}`);
        }
        localStorage.setItem("open_lexicon_bookmarks", JSON.stringify(state.bookmarks));
        updateBookmarkCount();
        const isBookmarked = state.bookmarks.includes(w);
        bookmarkStar.textContent = isBookmarked ? "★" : "☆";
        btnToggleBookmark.classList.toggle("active", isBookmarked);
    });

    // Copy Markdown
    btnCopyMarkdown.addEventListener("click", () => {
        if (!state.selectedWord) return;
        const md = formatWordMarkdown(state.selectedWord);
        navigator.clipboard.writeText(md).then(() => {
            showToast("已复制 Markdown 格式卡片！");
        });
    });

    // Copy Anki
    btnCopyAnki.addEventListener("click", () => {
        if (!state.selectedWord) return;
        const w = state.selectedWord;
        const front = `${w.word} /${w.phonetic || ""}/`;
        const back = (w.senses || []).map(s => `[${s.pos}] ${s.meaning_zh} - ${s.english_definition}`).join("<br>");
        const tsv = `${front}\t${back}`;
        navigator.clipboard.writeText(tsv).then(() => {
            showToast("已复制单条 Anki 闪卡格式！");
        });
    });

    // Global keyboard shortcuts
    window.addEventListener("keydown", (e) => {
        // Press '/' to search
        if (e.key === "/" && document.activeElement !== searchInput) {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        }
        // Press 'Escape' to unfocus / clear
        if (e.key === "Escape") {
            if (searchInput.value) {
                searchInput.value = "";
                state.query = "";
                btnClearSearch.classList.add("hidden");
                loadWords(true);
            }
            searchInput.blur();
        }
        // Arrow navigation
        if (document.activeElement !== searchInput) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                navigateList(e.key === "ArrowDown" ? 1 : -1);
            }
        }
    });
}

function navigateList(direction) {
    if (state.words.length === 0) return;
    const currentId = state.selectedWord ? state.selectedWord.id : null;
    let idx = state.words.findIndex(w => w.id === currentId);
    if (idx === -1) idx = 0;
    else idx = Math.max(0, Math.min(state.words.length - 1, idx + direction));
    selectWord(state.words[idx].id);
}

function formatWordMarkdown(w) {
    let md = `# ${w.word} /${w.phonetic || ""}/\n\n`;
    if (w.exam_tags && w.exam_tags.length) {
        md += `**标签:** ${w.exam_tags.join(", ")}\n\n`;
    }
    md += `## 义项与例句\n`;
    (w.senses || []).forEach((s, i) => {
        md += `### ${i + 1}. [${s.pos}] ${s.meaning_zh} (${s.meaning_en})\n`;
        if (s.english_definition) md += `> **COBUILD:** ${s.english_definition}\n\n`;
        if (s.collocation_en) md += `- **搭配:** \`${s.collocation_en}\` ${s.collocation_zh || ""}\n`;
        if (s.sentence_en) md += `- **例句:** ${s.sentence_en}\n  ${s.sentence_zh || ""}\n\n`;
    });
    if (w.etymology_story && w.etymology_story.zh) {
        md += `## 词源故事\n${w.etymology_story.zh}\n\n`;
    }
    if (w.morphology_enriched && w.morphology_enriched.zh) {
        md += `## 构词法\n${w.morphology_enriched.zh}\n\n`;
    }
    if (w.synonyms_and_nuances && w.synonyms_and_nuances.zh) {
        md += `## 近义辨析\n${w.synonyms_and_nuances.zh}\n\n`;
    }
    if (w.mnemonic_anchor && w.mnemonic_anchor.zh) {
        md += `## 记忆锚点\n${w.mnemonic_anchor.zh}\n\n`;
    }
    return md;
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeJs(str) {
    if (!str) return "";
    return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
}
