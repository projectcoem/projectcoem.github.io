(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ReaderFeatures = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const memory = {};

  function storageGet(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return memory[key] || fallback;
    }
  }

  function storageSet(key, value) {
    memory[key] = value;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  }

  function storageRemove(key) {
    delete memory[key];
    try { localStorage.removeItem(key); } catch { /* private mode */ }
  }

  const READING_POSITION_INDEX = "coem:reader-position:v1:index";

  function readingPositionKey(type, id) {
    return `coem:reader-position:v1:${type}:${id}`;
  }

  function saveReadingPosition(type, id, scrollTop, max = 100) {
    if (!type || !id || !Number.isFinite(Number(scrollTop))) return null;
    const entry = {
      type: String(type), id: String(id),
      scrollTop: Math.max(0, Math.round(Number(scrollTop))), updatedAt: Date.now()
    };
    const key = readingPositionKey(entry.type, entry.id);
    storageSet(key, entry);
    const storedIndex = storageGet(READING_POSITION_INDEX, []);
    const index = (Array.isArray(storedIndex) ? storedIndex : [])
      .filter(item => item && item.key !== key && typeof item.key === "string");
    index.unshift({ key, updatedAt: entry.updatedAt });
    index.slice(Math.max(1, max)).forEach(item => storageRemove(item.key));
    storageSet(READING_POSITION_INDEX, index.slice(0, Math.max(1, max)));
    return entry;
  }

  function getReadingPosition(type, id) {
    const entry = storageGet(readingPositionKey(type, id), null);
    if (!entry || entry.type !== type || entry.id !== id ||
        !Number.isFinite(Number(entry.scrollTop)) || Number(entry.scrollTop) < 0 ||
        Number(entry.scrollTop) > 100000000 || !Number.isFinite(Number(entry.updatedAt))) return null;
    return { ...entry, scrollTop: Number(entry.scrollTop) };
  }

  function getLatestReadingPosition(type, excludeId = null) {
    const storedIndex = storageGet(READING_POSITION_INDEX, []);
    const index = Array.isArray(storedIndex) ? storedIndex : [];
    for (const item of index) {
      if (!item || typeof item.key !== "string") continue;
      const entry = storageGet(item.key, null);
      if (entry?.type === type && entry.id !== excludeId && entry.id &&
          Number.isFinite(Number(entry.scrollTop)) && Number(entry.scrollTop) > 0 &&
          Number(entry.scrollTop) <= 100000000 && Number.isFinite(Number(entry.updatedAt))) return entry;
    }
    return null;
  }

  function recordHistory(type, item, max = 30) {
    const key = `coem:${type}:history`;
    const history = storageGet(key, []).filter(entry => entry.id !== item.id);
    history.unshift({ ...item, visitedAt: Date.now() });
    storageSet(key, history.slice(0, max));
    return history.slice(0, max);
  }

  function toggleBookmark(type, item) {
    const key = `coem:${type}:bookmarks`;
    const bookmarks = storageGet(key, []);
    const exists = bookmarks.some(entry => entry.id === item.id);
    const next = exists
      ? bookmarks.filter(entry => entry.id !== item.id)
      : [{ ...item, savedAt: Date.now() }, ...bookmarks];
    storageSet(key, next);
    return !exists;
  }

  function isBookmarked(type, id) {
    return storageGet(`coem:${type}:bookmarks`, []).some(entry => entry.id === id);
  }

  function getLibrary(type) {
    return {
      bookmarks: storageGet(`coem:${type}:bookmarks`, []),
      history: storageGet(`coem:${type}:history`, [])
    };
  }

  function getItemFromURL(type) {
    return new URL(location.href).searchParams.get(type);
  }

  function updateURL(type, id, title, mode = "replace") {
    const url = new URL(location.href);
    url.searchParams.set(type, id);
    if (mode === "push") history.pushState({ type, id }, "", url);
    else if (mode === "replace") history.replaceState({ type, id }, "", url);
    document.title = `${title} · Coem`;
  }

  function createDiscoveryController({ panel, toggle, readingTarget, mobileQuery = "(max-width: 680px)" }) {
    if (!panel || !toggle) return null;
    const media = typeof matchMedia === "function" ? matchMedia(mobileQuery) : { matches: false };
    let collapsed = false;
    function render() {
      const shouldHide = collapsed && media.matches;
      panel.hidden = shouldHide;
      toggle.setAttribute("aria-expanded", String(!shouldHide));
      toggle.textContent = shouldHide ? "Search and filters" : "Hide search and filters";
      document.documentElement.classList.toggle("reader-discovery-collapsed", shouldHide);
    }
    function setCollapsed(value, { focusReading = false } = {}) {
      collapsed = Boolean(value);
      render();
      if (collapsed && focusReading && media.matches) {
        requestAnimationFrame(() => navigateToReadingStart(readingTarget, "smooth"));
      }
    }
    toggle.addEventListener("click", () => {
      setCollapsed(!collapsed);
      if (!collapsed) panel.querySelector("input, select, button")?.focus();
    });
    if (typeof media.addEventListener === "function") media.addEventListener("change", render);
    render();
    return { setCollapsed, isCollapsed: () => collapsed && media.matches };
  }

  function createReadingPositionTracker(type, getId, { delay = 250, getAnchor = () => null } = {}) {
    let timer = null;
    let restoring = false;
    let suspended = false;
    let restoreToken = 0;
    function save() {
      if (timer) clearTimeout(timer);
      timer = null;
      if (restoring || suspended) return;
      const id = getId();
      const anchor = getAnchor();
      if (!id || !anchor) return;
      const pageTop = window.scrollY || document.documentElement.scrollTop || 0;
      const anchorTop = pageTop + anchor.getBoundingClientRect().top;
      const offset = Math.max(0, Math.min(anchor.scrollHeight, pageTop - anchorTop));
      saveReadingPosition(type, id, offset);
    }
    function onScroll() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, delay);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", save);
    return { save, suspend() {
      save();
      suspended = true;
      restoring = false;
      restoreToken += 1;
    }, resume() {
      suspended = false;
    }, restore(id) {
      const position = getReadingPosition(type, id);
      if (!position) { suspended = false; return false; }
      const token = ++restoreToken;
      restoring = true;
      suspended = false;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (token !== restoreToken || getId() !== id) return;
        const anchor = getAnchor();
        if (anchor) {
          const pageTop = window.scrollY || document.documentElement.scrollTop || 0;
          const anchorTop = pageTop + anchor.getBoundingClientRect().top;
          window.scrollTo({ top: anchorTop + position.scrollTop, behavior: "auto" });
        }
        setTimeout(() => { if (token === restoreToken) restoring = false; }, 100);
      }));
      return true;
    } };
  }

  function getPreferences() {
    return storageGet("coem:preferences", { theme: "light", fontSize: 20 });
  }

  function applyPreferences(preferences = getPreferences()) {
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.style.setProperty("--reader-font-size", `${preferences.fontSize}px`);
    storageSet("coem:preferences", preferences);
    return preferences;
  }

  function setTheme(theme) {
    return applyPreferences({ ...getPreferences(), theme });
  }

  function changeFontSize(delta) {
    const preferences = getPreferences();
    preferences.fontSize = Math.max(16, Math.min(30, preferences.fontSize + delta));
    return applyPreferences(preferences);
  }

  function toast(message) {
    document.querySelector(".reader-toast")?.remove();
    const element = document.createElement("div");
    element.className = "reader-toast";
    element.setAttribute("role", "status");
    element.textContent = message;
    document.body.appendChild(element);
    setTimeout(() => element.remove(), 1800);
  }

  async function shareCurrent(title) {
    const data = { title, text: `${title} on Coem`, url: location.href };
    if (navigator.share) {
      await navigator.share(data);
      return "shared";
    }
    await navigator.clipboard.writeText(location.href);
    toast("Link copied");
    return "copied";
  }

  function formatTime(minutes) {
    const seconds = Math.max(0, Math.round(Number(minutes || 0) * 60));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} min`;
  }

  function normalizeText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .trim();
  }

  const metadataTranslations = {
    "Alemania": "Germany", "Arabia": "Arabia", "Austríaco": "Austria",
    "Belgica": "Belgium", "Boliviano": "Bolivia", "Brasil": "Brazil",
    "Checoslovaquia": "Czechoslovakia", "Dinamarca": "Denmark",
    "Egipto": "Egypt", "España": "Spain", "Estados Unidos": "United States",
    "Finlandia": "Finland", "Francia": "France", "Gales": "Wales",
    "Grecia": "Greece", "Griego": "Greece", "Inglaterra": "England",
    "Irán": "Iran", "Irlanda": "Ireland", "Italia": "Italy",
    "Italiano": "Italy", "Japon": "Japan", "Líbano": "Lebanon",
    "Marruecos": "Morocco", "México": "Mexico", "Mónaco": "Monaco",
    "Panamá": "Panama", "Persa": "Persia", "Polonia": "Poland",
    "Prusia": "Prussia", "Puertorriqueño": "Puerto Rico",
    "Reino Unido": "United Kingdom", "Republica Dominicana": "Dominican Republic",
    "República": "Dominican Republic", "Romano": "Rome", "Rumania": "Romania",
    "Rusia": "Russia", "Suiza": "Switzerland", "África": "Africa",
    "Antihéroe": "Antihero", "Ambiental": "Environmental",
    "Crítica literaria": "Literary Criticism", "Cuento corto": "Short Story",
    "Dramaturgia": "Drama", "Histórico": "Historical", "Historieta": "Comics",
    "Marina": "Maritime", "Militar": "Military", "Modernismo": "Modernism",
    "modernismo": "Modernism", "Novela": "Novel", "Pedagógico": "Educational",
    "Periodismo": "Journalism", "Policiaco": "Crime", "Poética": "Poetry",
    "Realismo": "Realism", "Realismo mágico": "Magical Realism",
    "Romanticismo": "Romanticism", "simbólica": "Symbolism",
    "Simbolismo": "Symbolism", "Social": "Social", "Suspenso": "Suspense"
  };

  function englishMetadata(value) {
    return metadataTranslations[String(value || "").trim()] || value;
  }

  function matchesFilters(item, filters) {
    if (filters.country && normalizeText(item.country) !== normalizeText(filters.country)) return false;
    if (filters.genre && normalizeText(item.genre) !== normalizeText(filters.genre)) return false;
    if (filters.maxMinutes && Number(item.readingTime) > Number(filters.maxMinutes)) return false;
    return true;
  }

  function filterItems(items, filters = {}) {
    const terms = normalizeText(filters.query).split(/\s+/).filter(Boolean);
    return items.filter(item => {
      if (!matchesFilters(item, filters)) return false;
      if (!terms.length) return true;
      const searchable = normalizeText([
        item.title, item.author, item.country, item.genre,
        item.birthYear, item.deathYear
      ].join(" "));
      return terms.every(term => searchable.includes(term));
    });
  }

  function buildFilterIndex(items) {
    return items.map(item => ({
      item,
      country: normalizeText(item.country),
      genre: normalizeText(item.genre),
      readingTime: Number(item.readingTime || 0),
      searchable: normalizeText([
        item.title, item.author, item.country, item.genre,
        item.birthYear, item.deathYear
      ].join(" "))
    }));
  }

  function filterIndexedItems(index, filters = {}) {
    const terms = normalizeText(filters.query).split(/\s+/).filter(Boolean);
    const country = normalizeText(filters.country);
    const genre = normalizeText(filters.genre);
    const maxMinutes = filters.maxMinutes ? Number(filters.maxMinutes) : 0;
    return index.filter(entry => {
      if (country && entry.country !== country) return false;
      if (genre && entry.genre !== genre) return false;
      if (maxMinutes && entry.readingTime > maxMinutes) return false;
      return terms.every(term => entry.searchable.includes(term));
    }).map(entry => entry.item);
  }

  function randomItem(items, filters = {}, excludeId, random = Math.random) {
    const eligible = filterItems(items, filters).filter(item => item.id !== excludeId);
    return eligible.length ? eligible[Math.floor(random() * eligible.length)] : null;
  }

  function navigateToReadingStart(element, behavior = "smooth") {
    if (!element) return false;
    element.setAttribute("tabindex", "-1");
    element.focus({ preventScroll: true });
    element.scrollIntoView({ behavior, block: "start" });
    return true;
  }

  return {
    storageGet, storageSet, storageRemove, recordHistory, toggleBookmark, isBookmarked, getLibrary,
    readingPositionKey, saveReadingPosition, getReadingPosition, getLatestReadingPosition,
    getItemFromURL, updateURL, getPreferences, applyPreferences, setTheme,
    changeFontSize, shareCurrent, formatTime, normalizeText, matchesFilters,
    filterItems, buildFilterIndex, filterIndexedItems, randomItem,
    navigateToReadingStart, createDiscoveryController, createReadingPositionTracker,
    toast, englishMetadata
  };
});
