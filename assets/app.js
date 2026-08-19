(() => {
  'use strict';

  const app = document.getElementById('app');
  let DATA = null;
  let route = { type: 'home' };
  let filter = 'All';
  let searchOpen = false;

  const STORE = {
    favorites: 'ocmw:favorites:v1',
    history: 'ocmw:history:v1'
  };

  const escapeHtml = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const stripTones = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const compact = (s = '') => stripTones(s).replace(/\s+/g, '');

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }
  function favorites() { return readJson(STORE.favorites, []); }
  function isFavorite(char) { return favorites().includes(char); }
  function toggleFavorite(char) {
    const next = new Set(favorites());
    if (next.has(char)) next.delete(char); else next.add(char);
    writeJson(STORE.favorites, [...next]);
    render();
  }
  function addRecent(char) {
    if (!char) return;
    const item = characterInfo(char);
    const list = readJson(STORE.history, []).filter(x => x.char !== char);
    list.unshift({ char, pinyin: item.pinyin || '', meaning: (item.meanings || []).join(', '), at: Date.now() });
    writeJson(STORE.history, list.slice(0, 30));
  }

  function featuredMap() {
    return new Map(DATA.featuredCharacters.map(x => [x.char, x]));
  }
  function videoInfo(char) {
    const item = featuredMap().get(char);
    return item?.video ? item : null;
  }
  function hasVideo(char) { return Boolean(videoInfo(char)); }
  function miaLessonChars(word) {
    return Array.isArray(word?.miaCharacters) ? word.miaCharacters.filter(hasVideo) : [];
  }
  function isFromCurrentMiaLesson(word, currentChar) {
    return miaLessonChars(word).includes(currentChar);
  }
  function miaWordBadge(word, currentChar = null) {
    if (currentChar && !isFromCurrentMiaLesson(word, currentChar)) return '';
    const lessons = miaLessonChars(word);
    if (!lessons.length) return '';
    const title = currentChar
      ? `This word appears in Mia's ${currentChar} video`
      : `Featured in Mia's lesson${lessons.length > 1 ? 's' : ''}: ${lessons.join(', ')}`;
    return `<span class="mia-word-badge" title="${escapeHtml(title)}"><span>▶</span> From Mia's video</span>`;
  }
  function videoMark(char, className = '') {
    if (!hasVideo(char)) return '';
    return `<span class="char-video-mark ${escapeHtml(className)}" title="Mia has a video lesson for ${escapeHtml(char)}" aria-label="Video lesson available">▶</span>`;
  }
  function characterInfo(char) {
    const featured = videoInfo(char);
    return featured || DATA.characterMeta[char] || { char, pinyin: '', meanings: ['connected character'] };
  }
  function wordsForChar(char) {
    return DATA.words
      .filter(w => w.components.some(c => c.char === char))
      .sort((a, b) => {
        const miaFirst = Number(isFromCurrentMiaLesson(b, char)) - Number(isFromCurrentMiaLesson(a, char));
        return miaFirst || (b.priority || 0) - (a.priority || 0) || a.word.localeCompare(b.word, 'zh');
      });
  }
  function wordByText(word) { return DATA.words.find(w => w.word === word); }

  function defaultTrailFor(nextRoute) {
    if (nextRoute.type === 'character') return [{ type: 'character', value: nextRoute.value }];
    if (nextRoute.type === 'word') return [{ type: 'word', value: nextRoute.value }];
    return [];
  }
  function currentTrail() {
    const trail = Array.isArray(history.state?.trail) ? history.state.trail : defaultTrailFor(route);
    return trail.filter((item, index) => index === 0 || item.type !== trail[index - 1].type || item.value !== trail[index - 1].value);
  }

  function urlFor(r) {
    if (r.type === 'home') return '/';
    if (r.type === 'character') return `/character/${encodeURIComponent(r.value)}`;
    if (r.type === 'word') return `/word/${encodeURIComponent(r.value)}`;
    return `/${r.type}`;
  }

  function navigate(nextRoute, options = {}) {
    const { replace = false, trail = null } = options;
    route = nextRoute;
    filter = 'All';
    searchOpen = false;
    const state = { trail: trail ?? defaultTrailFor(nextRoute) };
    if (replace) history.replaceState(state, '', urlFor(nextRoute));
    else history.pushState(state, '', urlFor(nextRoute));
    if (route.type === 'character') addRecent(route.value);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function navigateCharacter(char, viaWord = null) {
    const trail = [...currentTrail()];
    if (viaWord) {
      if (!trail.length || trail.at(-1)?.type !== 'character' || trail.at(-1)?.value !== route.value) {
        if (route.type === 'character') trail.push({ type: 'character', value: route.value });
      }
      if (trail.at(-1)?.type !== 'word' || trail.at(-1)?.value !== viaWord) trail.push({ type: 'word', value: viaWord });
      trail.push({ type: 'character', value: char });
    } else {
      trail.length = 0;
      trail.push({ type: 'character', value: char });
    }
    navigate({ type: 'character', value: char }, { trail });
  }

  function navigateWord(word) {
    const trail = [...currentTrail()];
    if (route.type === 'character' && (!trail.length || trail.at(-1)?.value !== route.value)) {
      trail.push({ type: 'character', value: route.value });
    }
    if (trail.at(-1)?.type !== 'word' || trail.at(-1)?.value !== word) trail.push({ type: 'word', value: word });
    navigate({ type: 'word', value: word }, { trail });
  }

  function parseRoute() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    if (!parts.length) return { type: 'home' };
    if (parts[0] === 'character' && parts[1]) return { type: 'character', value: parts.slice(1).join('/') };
    if (parts[0] === 'word' && parts[1]) return { type: 'word', value: parts.slice(1).join('/') };
    if (['favorites', 'history', 'about'].includes(parts[0])) return { type: parts[0] };
    return { type: 'home' };
  }

  function navMarkup() {
    const current = route.type;
    const navButton = (type, label, icon) => `<button data-nav="${type}" class="${current === type ? 'active' : ''}">${icon ? `<span>${icon}</span>` : ''}${escapeHtml(label)}</button>`;
    return `
      <header class="topbar">
        <div class="topbar-inner">
          <button class="brand" data-nav="home" aria-label="Go home">
            <span class="brand-mark">字</span>
            <span class="brand-copy"><strong>One Character,<br>Many Words</strong><span>一字，多词。</span></span>
          </button>
          <nav class="nav" aria-label="Primary">
            ${navButton('home', 'Explore', '')}
            ${navButton('favorites', '♡ Favorites', '')}
            ${navButton('history', '↺ History', '')}
            ${navButton('about', 'ⓘ About', '')}
          </nav>
        </div>
      </header>`;
  }

  function mobileNavMarkup() {
    const current = route.type;
    const b = (type, label, icon) => `<button data-nav="${type}" class="${current === type ? 'active' : ''}"><span>${icon}</span>${label}</button>`;
    return `<nav class="mobile-nav" aria-label="Mobile navigation">
      ${b('home','Explore','⌘')}${b('favorites','Favorites','♡')}${b('history','History','↺')}${b('about','About','ⓘ')}
    </nav>`;
  }

  function breadcrumbsMarkup() {
    const trail = currentTrail();
    if (!trail.length) return '';
    return `<div class="breadcrumb" aria-label="Exploration path">
      <button data-nav="home">Explore</button>
      ${trail.map((item, index) => {
        const label = item.value;
        const isLast = index === trail.length - 1;
        const button = isLast
          ? `<span>${escapeHtml(label)}</span>`
          : `<button data-trail-index="${index}">${escapeHtml(label)}</button>`;
        return `<span>→</span>${button}`;
      }).join('')}
    </div>`;
  }

  function homeMarkup() {
    const cards = DATA.featuredCharacters.map((c, i) => `
      <button class="character-card ${i === 0 ? 'featured-first' : ''}" data-char="${escapeHtml(c.char)}">
        <div class="hanzi">${escapeHtml(c.char)}</div>
        <div class="pinyin">${escapeHtml(c.pinyin)}</div>
        <div class="meanings">${escapeHtml(c.meanings.join(' · '))}</div>
        ${hasVideo(c.char) ? '<span class="video-badge">▶ Mia video</span>' : ''}
      </button>`).join('');

    return `
      <main class="container">
        <section class="hero">
          <div>
            <h1>Learn Chinese by following the <em>connections</em> between characters.</h1>
            <p>Start with one character, see the common words it builds, then tap any character inside a word to keep exploring.</p>
            <div class="search-wrap">
              <span class="search-icon">⌕</span>
              <input id="search" class="search" autocomplete="off" placeholder="Search a character, word, pinyin or meaning…" aria-label="Search" />
              <div id="searchResults"></div>
            </div>
          </div>
          <div class="network-art" aria-hidden="true">
            <div class="node main">字<span class="node-label">character</span></div>
            <div class="node small n1">一<span class="node-label">one</span></div>
            <div class="node small n2">词<span class="node-label">words</span></div>
            <div class="node small n3">学<span class="node-label">learn</span></div>
            <div class="node small n4">连<span class="node-label">connect</span></div>
          </div>
        </section>
        <section>
          <div class="section-head">
            <div><h2>Explore characters</h2><p>${DATA.featuredCharacters.length} video-backed starting points in this prototype. <span class="video-legend"><span class="legend-play">▶</span> Video lesson available</span></p></div>
            <button class="secondary" id="surprise">↝ Surprise me</button>
          </div>
          <div class="character-grid">${cards}</div>
        </section>
      </main>`;
  }

  function characterMarkup(char) {
    const info = characterInfo(char);
    const featured = videoInfo(char);
    const allWords = wordsForChar(char);
    const categories = ['All', ...new Set(allWords.map(w => w.category))];
    const shown = filter === 'All' ? allWords : allWords.filter(w => w.category === filter);
    const words = shown.map(w => wordCardMarkup(w, char)).join('');
    const related = [...new Set(allWords.flatMap(w => w.components.map(c => c.char)).filter(c => c !== char))].slice(0, 16);
    const desc = featured?.description || `This character is connected to ${allWords.length} word${allWords.length === 1 ? '' : 's'} in the prototype. Follow any highlighted character to continue exploring.`;
    return `
      <main class="container">
        <div class="page-head">${breadcrumbsMarkup()}</div>
        <section class="character-hero">
          <div class="big-char">${escapeHtml(char)}</div>
          <div>
            <div class="char-title-row"><h1>${escapeHtml(char)}</h1><span class="char-pinyin">${escapeHtml(info.pinyin || '')}</span></div>
            <div class="tag-row">${(info.meanings || []).map(m => `<span class="tag">${escapeHtml(m)}</span>`).join('')}</div>
            <p class="char-desc">${escapeHtml(desc)}</p>
            <div class="actions">
              ${featured ? `<a class="primary" href="${escapeHtml(featured.video)}" target="_blank" rel="noopener noreferrer">▶ Watch Mia's original lesson</a>` : ''}
              <button class="secondary ${isFavorite(char) ? 'active' : ''}" data-favorite="${escapeHtml(char)}">${isFavorite(char) ? '♥ Saved' : '♡ Favorite'}</button>
            </div>
          </div>
        </section>
        <div class="words-toolbar">
          <h2>Words with <span style="color:var(--red)">${escapeHtml(char)}</span> <span style="font-size:13px;color:var(--muted);font-weight:500">(${allWords.length})</span></h2>
          <div class="filters">${categories.map(c => `<button class="filter ${filter === c ? 'active' : ''}" data-filter="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}</div>
        </div>
        ${words ? `<div class="word-grid">${words}</div>` : `<div class="empty-state">No words in this category yet.</div>`}
        ${related.length ? `<section class="related-strip"><h3>Continue through a connected character</h3><div class="related-chars">${related.map(c => {
          const ci = characterInfo(c); return `<button class="related-char ${hasVideo(c) ? 'has-video' : ''}" data-char="${escapeHtml(c)}"><span>${escapeHtml(c)} · ${escapeHtml(ci.pinyin || '')}</span>${videoMark(c, 'related-video-mark')}</button>`;
        }).join('')}</div></section>` : ''}
      </main>`;
  }

  function wordCardMarkup(w, currentChar) {
    const chars = [...w.word];
    const wordChars = chars.map(c => `<button class="${c === currentChar ? 'current' : ''} ${hasVideo(c) ? 'has-video' : ''}" data-component="${escapeHtml(c)}" data-via-word="${escapeHtml(w.word)}" title="Explore ${escapeHtml(c)}${hasVideo(c) ? ' · video lesson available' : ''}"><span class="hanzi-glyph">${escapeHtml(c)}</span>${videoMark(c, 'word-char-video')}</button>`).join('');
    const comps = w.components.map((c, i) => `${i ? '<span class="plus">+</span>' : ''}<button class="component ${hasVideo(c.char) ? 'has-video' : ''}" data-component="${escapeHtml(c.char)}" data-via-word="${escapeHtml(w.word)}"><strong>${escapeHtml(c.char)}</strong>${escapeHtml(c.gloss)}${videoMark(c.char, 'component-video')}</button>`).join('');
    return `<article class="word-card">
      <div class="word-top">
        <div>
          <div class="word-main"><div class="word-hanzi">${wordChars}</div><span class="word-pinyin">${escapeHtml(w.pinyin)}</span></div>
          <div class="word-meaning">${escapeHtml(w.meaning)}</div>
          ${miaWordBadge(w, currentChar)}
        </div>
        <button class="word-open" data-word="${escapeHtml(w.word)}" aria-label="Open ${escapeHtml(w.word)}">→</button>
      </div>
      <div class="components">${comps}</div>
      <div class="explanation">→ ${escapeHtml(w.explanation)}</div>
      <span class="transparency ${escapeHtml(w.transparency)}">${w.transparency === 'direct' ? 'clear compound' : w.transparency === 'extended' ? 'meaning extended' : 'learn as a whole'}</span>
    </article>`;
  }

  function wordMarkup(word) {
    const w = wordByText(word);
    if (!w) return `<main class="container"><div class="empty-state"><h2>${escapeHtml(word)}</h2><p>This word has not been expanded in the prototype yet.</p><button class="secondary" data-nav="home">Back to Explore</button></div></main>`;
    const comps = w.components.map(c => {
      const info = characterInfo(c.char);
      return `<button class="component-big ${hasVideo(c.char) ? 'has-video' : ''}" data-component="${escapeHtml(c.char)}" data-via-word="${escapeHtml(w.word)}">
        ${videoMark(c.char, 'detail-video-mark')}<div class="c">${escapeHtml(c.char)}</div><div class="p">${escapeHtml(info.pinyin || '')}</div><div class="g">In this word: ${escapeHtml(c.gloss)}</div>
      </button>`;
    }).join('');
    const sourceLinks = miaLessonChars(w).map(char => {
      const video = videoInfo(char);
      return `<a class="mia-source-link" href="${escapeHtml(video.video)}" target="_blank" rel="noopener noreferrer">▶ ${escapeHtml(char)} lesson</a>`;
    }).join('');
    return `<main class="container">
      <div class="page-head">${breadcrumbsMarkup()}</div>
      <article class="word-detail">
        <h1>${escapeHtml(w.word)}</h1>
        <p class="lead">${escapeHtml(w.pinyin)}</p>
        <div class="meaning-big">${escapeHtml(w.meaning)}</div>
        ${sourceLinks ? `<div class="mia-source-row">${miaWordBadge(w)}${sourceLinks}</div>` : ''}
        <div class="component-breakdown">${comps}</div>
        <p class="char-desc"><strong style="color:var(--ink)">How the pieces connect:</strong><br>${escapeHtml(w.explanation)}</p>
        ${w.note ? `<p class="char-desc"><strong style="color:var(--ink)">Usage note:</strong><br>${escapeHtml(w.note)}</p>` : ''}
        <span class="transparency ${escapeHtml(w.transparency)}">${w.transparency === 'direct' ? 'clear compound' : w.transparency === 'extended' ? 'meaning extended' : 'learn as a whole'}</span>
      </article>
    </main>`;
  }

  function favoritesMarkup() {
    const favs = favorites();
    const rows = favs.map(char => listRowMarkup(char)).join('');
    return `<main class="container"><div class="section-head"><div><h2>Favorites</h2><p>Your saved characters stay on this device.</p></div></div>${rows ? `<div class="favorites-list">${rows}</div>` : '<div class="empty-state">No favorites yet. Open a character and tap ♡ Favorite.</div>'}</main>`;
  }

  function historyMarkup() {
    const list = readJson(STORE.history, []);
    const rows = list.map(x => listRowMarkup(x.char, x.at)).join('');
    return `<main class="container"><div class="section-head"><div><h2>Exploration history</h2><p>The characters you visited most recently.</p></div>${list.length ? '<button class="secondary" id="clearHistory">Clear</button>' : ''}</div>${rows ? `<div class="history-list">${rows}</div>` : '<div class="empty-state">Your exploration trail will appear here.</div>'}</main>`;
  }

  function listRowMarkup(char, at = null) {
    const info = characterInfo(char);
    const when = at ? new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
    return `<button class="list-row" data-char="${escapeHtml(char)}"><span class="left"><span class="char ${hasVideo(char) ? 'has-video' : ''}">${escapeHtml(char)}${videoMark(char, 'list-video-mark')}</span><span><strong>${escapeHtml(info.pinyin || '')}</strong><br><small>${escapeHtml((info.meanings || []).join(', '))}</small></span></span><span><small>${escapeHtml(when)}</small> →</span></button>`;
  }

  function aboutMarkup() {
    const creator = DATA.creator || { name: 'Mia Zhao', website: 'https://miazhao.com/' };
    return `<main class="container"><article class="about">
      <h1>One character opens many paths.</h1>
      <p>This prototype treats Mandarin vocabulary as a network rather than a list. Start with a character, inspect common words that contain it, then follow any component into the next set of words.</p>
      <p>The component explanations are learning aids, not claims that every modern Chinese word can be translated literally character by character. When a word is lexicalized or the relationship is indirect, the app tells you instead of inventing a false literal meaning.</p>
      <div class="creator-card">
        <div class="creator-mark">米</div>
        <div><span class="eyebrow">Original video lessons</span><h2>${escapeHtml(creator.name)}</h2><p>The featured characters link to Mia's original character-vocabulary videos that inspired this project. A small <span class="inline-video-mark">▶</span> beside a character means a video is available before you follow that path. Words carrying a <strong>From Mia's video</strong> badge are part of her original lesson list; the app also adds extra useful words around them.</p><a class="creator-link" href="${escapeHtml(creator.website)}" target="_blank" rel="noopener noreferrer">Visit Mia's Mandarin teaching website ↗</a></div>
      </div>
      <p><strong>Prototype content:</strong> ${DATA.featuredCharacters.length} video-backed starting characters, ${DATA.miaPlaylist?.uniqueWordCount || 0} distinct words from Mia's videos, and ${DATA.words.length} connected words overall.</p>
    </article></main>`;
  }

  function render() {
    let body;
    switch (route.type) {
      case 'character': body = characterMarkup(route.value); break;
      case 'word': body = wordMarkup(route.value); break;
      case 'favorites': body = favoritesMarkup(); break;
      case 'history': body = historyMarkup(); break;
      case 'about': body = aboutMarkup(); break;
      default: body = homeMarkup();
    }
    const creator = DATA.creator || { name: 'Mia Zhao', website: 'https://miazhao.com/' };
    app.innerHTML = `<div class="shell">${navMarkup()}${body}<footer class="footer">One Character, Many Words · prototype v${escapeHtml(DATA.version)} · Video lessons by <a href="${escapeHtml(creator.website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(creator.name)}</a></footer>${mobileNavMarkup()}</div>`;
    bindEvents();
  }

  function bindEvents() {
    app.querySelectorAll('[data-nav]').forEach(el => el.addEventListener('click', () => {
      const type = el.dataset.nav;
      navigate({ type: type === 'home' ? 'home' : type });
    }));
    app.querySelectorAll('[data-char]').forEach(el => el.addEventListener('click', () => navigateCharacter(el.dataset.char)));
    app.querySelectorAll('[data-component]').forEach(el => el.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateCharacter(el.dataset.component, el.dataset.viaWord || null);
    }));
    app.querySelectorAll('[data-word]').forEach(el => el.addEventListener('click', () => navigateWord(el.dataset.word)));
    app.querySelectorAll('[data-filter]').forEach(el => el.addEventListener('click', () => { filter = el.dataset.filter; render(); }));
    app.querySelectorAll('[data-favorite]').forEach(el => el.addEventListener('click', () => toggleFavorite(el.dataset.favorite)));
    app.querySelectorAll('[data-trail-index]').forEach(el => el.addEventListener('click', () => {
      const idx = Number(el.dataset.trailIndex);
      const trail = currentTrail().slice(0, idx + 1);
      const item = trail.at(-1);
      navigate({ type: item.type, value: item.value }, { trail });
    }));

    const surprise = document.getElementById('surprise');
    if (surprise) surprise.addEventListener('click', () => {
      const c = DATA.featuredCharacters[Math.floor(Math.random() * DATA.featuredCharacters.length)];
      navigateCharacter(c.char);
    });

    const clearHistory = document.getElementById('clearHistory');
    if (clearHistory) clearHistory.addEventListener('click', () => { writeJson(STORE.history, []); render(); });

    const search = document.getElementById('search');
    if (search) {
      search.addEventListener('input', () => renderSearch(search.value));
      search.addEventListener('focus', () => { if (search.value.trim()) renderSearch(search.value); });
      search.addEventListener('keydown', e => {
        if (e.key === 'Escape') { document.getElementById('searchResults').innerHTML = ''; searchOpen = false; }
      });
    }
  }

  function renderSearch(raw) {
    const box = document.getElementById('searchResults');
    if (!box) return;
    const q = raw.trim();
    if (!q) { box.innerHTML = ''; searchOpen = false; return; }
    const nq = compact(q);
    const allChars = Object.entries(DATA.characterMeta).map(([char, info]) => ({ char, ...info }));
    const charResults = allChars.filter(c => {
      const hay = compact(`${c.char} ${c.pinyin || ''} ${(c.meanings || []).join(' ')}`);
      return hay.includes(nq);
    }).slice(0, 5);
    const wordResults = DATA.words.filter(w => {
      const hay = compact(`${w.word} ${w.pinyin} ${w.meaning}`);
      return hay.includes(nq);
    }).slice(0, 7);
    if (!charResults.length && !wordResults.length) {
      box.innerHTML = `<div class="search-results"><div class="search-item"><div class="search-meta"><strong>No result yet</strong><span>Try a Chinese character, pinyin, or English meaning.</span></div></div></div>`;
      return;
    }
    box.innerHTML = `<div class="search-results">
      ${charResults.map(c => `<button class="search-item" data-search-char="${escapeHtml(c.char)}"><span class="search-hanzi ${hasVideo(c.char) ? 'has-video' : ''}">${escapeHtml(c.char)}${videoMark(c.char, 'search-video-mark')}</span><span class="search-meta"><strong>${escapeHtml(c.pinyin || '')}${hasVideo(c.char) ? ' · video lesson' : ''}</strong><span>${escapeHtml((c.meanings || []).join(', '))}</span></span></button>`).join('')}
      ${wordResults.map(w => `<button class="search-item" data-search-word="${escapeHtml(w.word)}"><span class="search-hanzi">${escapeHtml(w.word)}</span><span class="search-meta"><strong>${escapeHtml(w.pinyin)}</strong><span>${escapeHtml(w.meaning)}</span></span></button>`).join('')}
    </div>`;
    box.querySelectorAll('[data-search-char]').forEach(el => el.addEventListener('click', () => navigateCharacter(el.dataset.searchChar)));
    box.querySelectorAll('[data-search-word]').forEach(el => el.addEventListener('click', () => navigateWord(el.dataset.searchWord)));
    searchOpen = true;
  }

  window.addEventListener('popstate', (event) => {
    route = parseRoute();
    filter = 'All';
    if (route.type === 'character') addRecent(route.value);
    if (!event.state?.trail) history.replaceState({ trail: defaultTrailFor(route) }, '', window.location.href);
    render();
  });

  async function init() {
    try {
      const res = await fetch('/assets/content.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Content request failed: ${res.status}`);
      DATA = await res.json();
      route = parseRoute();
      if (!history.state?.trail) history.replaceState({ trail: defaultTrailFor(route) }, '', window.location.href);
      if (route.type === 'character') addRecent(route.value);
      render();
    } catch (err) {
      console.error(err);
      app.innerHTML = `<main class="container"><div class="empty-state"><h2>Could not load the vocabulary data.</h2><p>${escapeHtml(err.message)}</p></div></main>`;
    }
  }

  init();
})();
