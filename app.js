(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const STORAGE_KEY = 'tier-rasa:v1';
  const TIERS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  const TIER_LABELS = {
    10: 'Legendary', 9: 'Amazing', 8: 'Great', 7: 'Good', 6: 'Decent',
    5: 'Okay', 4: 'Meh', 3: 'Not great', 2: 'Bad', 1: 'Nope',
  };
  const TIER_COLORS = {
    10: ['#178a4c', '#ffffff'], 9: ['#4cb35a', '#10200f'], 8: ['#8cc152', '#17210b'],
    7: ['#c4cf3a', '#232408'], 6: ['#f2d43a', '#2b2405'], 5: ['#f7b733', '#2d1f04'],
    4: ['#f39237', '#2c1704'], 3: ['#ec6b3c', '#2a0f05'], 2: ['#d9443a', '#ffffff'],
    1: ['#a82a26', '#ffffff'],
  };
  const PLAYER_COLORS = [
    '#e4572e', '#2e86ab', '#76b041', '#a23b72', '#f1a208',
    '#17bebb', '#8e6c8a', '#3d5a80', '#c73e1d', '#4f772d',
  ];
  const MAX_PLAYERS = 12;
  const NAME_MAX = 24;

  const $app = document.getElementById('app');
  const $nav = document.getElementById('nav');
  const $toast = document.getElementById('toast');

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const tierStyle = (t) => `--tier:${TIER_COLORS[t][0]};--tier-ink:${TIER_COLORS[t][1]}`;

  const itemById = (id) => state.items.find((i) => i.id === id);
  const playerById = (id) => state.players.find((p) => p.id === id);
  const displayName = (p) => (p && p.name.trim()) || 'Unnamed';
  const initial = (p) => (Array.from(displayName(p))[0] || '?').toUpperCase();

  function avatar(p, size = '') {
    return `<span class="avatar ${size}" style="--c:${p.color}" aria-hidden="true">${esc(initial(p))}</span>`;
  }

  function makePlayer(name, colorIndex) {
    return { id: uid(), name, color: PLAYER_COLORS[colorIndex % PLAYER_COLORS.length] };
  }

  function nextPlayerName() {
    let n = state.players.length + 1;
    const taken = new Set(state.players.map((p) => p.name.trim().toLowerCase()));
    while (taken.has(`player ${n}`)) n++;
    return `Player ${n}`;
  }

  function nextColor() {
    const used = new Set(state.players.map((p) => p.color));
    return PLAYER_COLORS.find((c) => !used.has(c)) || PLAYER_COLORS[state.players.length % PLAYER_COLORS.length];
  }

  // ---------------------------------------------------------------------------
  // State & persistence
  // ---------------------------------------------------------------------------
  function freshState() {
    return {
      screen: 'setup',
      players: [makePlayer('Player 1', 0), makePlayer('Player 2', 1)],
      items: window.DEFAULT_ITEMS.map((i) => ({ ...i })),
      selected: window.DEFAULT_ITEMS.filter((i) => i.starter).map((i) => i.id),
      settings: { shuffle: true, blind: false },
      game: null,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.players) || !Array.isArray(s.items)) return null;
      // Bring in any built-in items added since this save was made.
      for (const def of window.DEFAULT_ITEMS) {
        if (!s.items.some((i) => i.id === def.id)) s.items.push({ ...def });
      }
      s.settings = { shuffle: true, blind: false, ...s.settings };
      s.selected = Array.isArray(s.selected) ? s.selected : [];
      return s;
    } catch {
      return null;
    }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  }

  let state = load() || freshState();

  // Transient UI state (not persisted).
  const ui = {
    filter: 'all',
    search: '',
    armed: null,
    armTimer: null,
    resultsView: 'ranking',
    suppressClickUntil: 0,
  };

  function commit() {
    save();
    render();
  }

  // Two-step confirmation for destructive buttons (no native confirm()).
  function confirmArmed(key) {
    clearTimeout(ui.armTimer);
    if (ui.armed === key) {
      ui.armed = null;
      return true;
    }
    ui.armed = key;
    ui.armTimer = setTimeout(() => { ui.armed = null; render(); }, 3500);
    render();
    return false;
  }

  let toastTimer;
  function toast(msg) {
    $toast.textContent = msg;
    $toast.hidden = false;
    $toast.classList.remove('show');
    void $toast.offsetWidth;
    $toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $toast.classList.remove('show'); $toast.hidden = true; }, 2200);
  }

  // ---------------------------------------------------------------------------
  // Players
  // ---------------------------------------------------------------------------
  function addPlayer(name) {
    if (state.players.length >= MAX_PLAYERS) {
      toast(`Max ${MAX_PLAYERS} players`);
      return false;
    }
    const clean = (name || '').trim().slice(0, NAME_MAX) || nextPlayerName();
    const p = { id: uid(), name: clean, color: nextColor() };
    state.players.push(p);
    if (state.game) state.game.scores[p.id] = {};
    toast(`${clean} joined`);
    return true;
  }

  function removePlayer(id) {
    const idx = state.players.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const [removed] = state.players.splice(idx, 1);
    const g = state.game;
    if (g) {
      delete g.scores[id];
      g.history = g.history.filter((h) => h.playerId !== id);
      if (g.viewing === id) g.viewing = null;
      if (!g.finished && state.players.length) {
        if (idx < g.turnIndex) {
          g.turnIndex--;
        } else if (idx === g.turnIndex) {
          g.pending = null;
          g.handoff = state.settings.blind && state.players.length > 1;
        }
        if (g.turnIndex >= state.players.length) {
          g.turnIndex = 0;
          g.itemIndex++;
          if (g.itemIndex >= g.order.length) finishGame();
        }
      } else if (!state.players.length) {
        g.turnIndex = 0;
        g.pending = null;
      }
    }
    toast(`${displayName(removed)} removed`);
  }

  function cycleColor(id) {
    const p = playerById(id);
    if (!p) return;
    const i = PLAYER_COLORS.indexOf(p.color);
    p.color = PLAYER_COLORS[(i + 1) % PLAYER_COLORS.length];
  }

  // ---------------------------------------------------------------------------
  // Items
  // ---------------------------------------------------------------------------
  function addCustomItem({ name, emoji, type }) {
    const clean = (name || '').trim().slice(0, 32);
    if (!clean) { toast('Give it a name first'); return false; }
    if (state.items.some((i) => i.name.toLowerCase() === clean.toLowerCase())) {
      toast(`${clean} is already on the list`);
      return false;
    }
    const item = {
      id: `custom-${uid()}`,
      type: type === 'drink' ? 'drink' : 'food',
      emoji: (emoji || '').trim() || (type === 'drink' ? '🥤' : '🍽️'),
      name: clean,
      desc: 'Added by you',
      custom: true,
    };
    state.items.push(item);
    state.selected.push(item.id);
    toast(`${clean} added`);
    return true;
  }

  function itemInActiveGame(id) {
    return !!(state.game && state.game.order.includes(id));
  }

  function removeCustomItem(id) {
    if (itemInActiveGame(id)) { toast('That item is part of the current game'); return; }
    state.items = state.items.filter((i) => i.id !== id);
    state.selected = state.selected.filter((s) => s !== id);
  }

  function visibleItems() {
    const q = ui.search.trim().toLowerCase();
    return state.items.filter((i) =>
      (ui.filter === 'all' || i.type === ui.filter) &&
      (!q || i.name.toLowerCase().includes(q) || (i.desc || '').toLowerCase().includes(q)));
  }

  // ---------------------------------------------------------------------------
  // Game flow
  // ---------------------------------------------------------------------------
  const currentPlayer = () => state.players[state.game.turnIndex];
  const currentItem = () => itemById(state.game.order[state.game.itemIndex]);

  function startGame() {
    const ids = state.items.filter((i) => state.selected.includes(i.id)).map((i) => i.id);
    if (!ids.length || !state.players.length) return;
    state.game = {
      order: state.settings.shuffle ? shuffle(ids) : ids,
      itemIndex: 0,
      turnIndex: 0,
      scores: Object.fromEntries(state.players.map((p) => [p.id, {}])),
      pending: null,
      history: [],
      viewing: null,
      handoff: state.settings.blind && state.players.length > 1,
      finished: false,
    };
    state.screen = 'play';
    ui.resultsView = 'ranking';
  }

  function finishGame() {
    const g = state.game;
    g.finished = true;
    g.pending = null;
    g.handoff = false;
    state.screen = 'results';
  }

  function canPlace() {
    const g = state.game;
    return !!(g && !g.finished && !g.handoff && state.players.length && currentItem());
  }

  function setPending(tier) {
    if (!canPlace()) return;
    state.game.pending = tier;
    state.game.viewing = null;
    commit();
  }

  function lockIn() {
    const g = state.game;
    if (!canPlace() || g.pending == null) return;
    const p = currentPlayer();
    const item = currentItem();
    (g.scores[p.id] ||= {})[item.id] = g.pending;
    g.history.push({ playerId: p.id, itemId: item.id, itemIndex: g.itemIndex });
    g.pending = null;
    g.viewing = null;

    g.turnIndex++;
    if (g.turnIndex >= state.players.length) {
      g.turnIndex = 0;
      g.itemIndex++;
    }
    if (g.itemIndex >= g.order.length) {
      finishGame();
      toast('All done — here are the results!');
    } else if (state.settings.blind && state.players.length > 1) {
      g.handoff = true;
    }
    commit();
  }

  function undo() {
    const g = state.game;
    if (!g) return;
    if (g.pending != null && !g.finished) {
      g.pending = null;
      commit();
      return;
    }
    let entry;
    while ((entry = g.history.pop())) {
      const idx = state.players.findIndex((p) => p.id === entry.playerId);
      if (idx === -1) continue;
      const prev = g.scores[entry.playerId]?.[entry.itemId];
      if (prev == null) continue;
      delete g.scores[entry.playerId][entry.itemId];
      g.itemIndex = entry.itemIndex;
      g.turnIndex = idx;
      g.pending = prev;
      g.finished = false;
      g.handoff = false;
      g.viewing = null;
      state.screen = 'play';
      toast(`Back to ${displayName(state.players[idx])}'s turn`);
      commit();
      return;
    }
    toast('Nothing to undo');
  }

  function scoreCount() {
    const g = state.game;
    if (!g) return 0;
    return state.players.reduce((n, p) => n + Object.keys(g.scores[p.id] || {}).length, 0);
  }

  // ---------------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------------
  function computeResults() {
    const g = state.game;
    const players = state.players;
    const rows = [];
    for (const id of g.order) {
      const item = itemById(id);
      if (!item) continue;
      const per = {};
      const vals = [];
      for (const p of players) {
        const v = g.scores[p.id]?.[id];
        if (v != null) { per[p.id] = v; vals.push(v); }
      }
      if (!vals.length) continue;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((a, v) => a + (v - avg) ** 2, 0) / vals.length);
      rows.push({ item, per, avg, sd, min: Math.min(...vals), max: Math.max(...vals), count: vals.length });
    }
    rows.sort((a, b) => b.avg - a.avg || a.sd - b.sd || a.item.name.localeCompare(b.item.name));
    rows.forEach((r, i) => {
      r.rank = i > 0 && Math.abs(rows[i - 1].avg - r.avg) < 1e-9 ? rows[i - 1].rank : i + 1;
    });

    const playerStats = players.map((p) => {
      const vals = g.order.map((id) => g.scores[p.id]?.[id]).filter((v) => v != null);
      return { p, count: vals.length, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
    }).filter((s) => s.count);

    let twins = null;
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = g.scores[players[i].id] || {};
        const b = g.scores[players[j].id] || {};
        const common = g.order.filter((id) => a[id] != null && b[id] != null);
        if (common.length < 2) continue;
        const diff = common.reduce((s, id) => s + Math.abs(a[id] - b[id]), 0) / common.length;
        if (!twins || diff < twins.diff) twins = { a: players[i], b: players[j], diff };
      }
    }
    return { rows, playerStats, twins };
  }

  // ---------------------------------------------------------------------------
  // Rendering: shared bits
  // ---------------------------------------------------------------------------
  function chip(item, { pending = false, score = null } = {}) {
    return `
      <div class="chip${pending ? ' pending' : ''}" ${pending ? 'data-draggable="1" title="Drag to another tier"' : `title="${esc(item.name)}"`}>
        <span class="chip-emoji" aria-hidden="true">${esc(item.emoji)}</span>
        <span class="chip-name">${esc(item.name)}</span>
        ${score != null ? `<span class="chip-score">${esc(score)}</span>` : ''}
      </div>`;
  }

  function bigCard(item) {
    return `
      <div class="food-card" data-draggable="1" aria-label="${esc(item.name)} — drag onto a tier">
        <span class="food-type">${item.type === 'drink' ? 'Minuman' : 'Makanan'}</span>
        <span class="food-emoji" aria-hidden="true">${esc(item.emoji)}</span>
        <span class="food-name">${esc(item.name)}</span>
        <span class="food-desc">${esc(item.desc || '')}</span>
        <span class="food-grip" aria-hidden="true">⠿ drag me</span>
      </div>`;
  }

  // byTier: { 10: [{item, ...}], ... }
  function board(byTier, { interactive = false, compact = false, pending = null, emptyHint = false } = {}) {
    return `
      <div class="board${compact ? ' compact' : ''}${interactive ? ' interactive' : ''}">
        ${TIERS.map((t) => {
          const list = (byTier[t] || []).map((e) => chip(e.item, { score: e.score })).join('');
          const pend = pending && pending.tier === t ? chip(pending.item, { pending: true }) : '';
          const attrs = interactive
            ? `data-drop="${t}" data-action="place" data-tier="${t}" role="button" tabindex="-1" aria-label="Place in tier ${t} — ${TIER_LABELS[t]}"`
            : '';
          return `
            <div class="tier-row" ${attrs} style="${tierStyle(t)}">
              <div class="tier-label">
                <span class="tier-num">${t}</span>
                ${compact ? '' : `<span class="tier-name">${TIER_LABELS[t]}</span>`}
              </div>
              <div class="tier-items">
                ${list}${pend}
                ${interactive && !list && !pend ? '<span class="tier-empty">Drop here</span>' : ''}
                ${emptyHint && !list && !pend ? '<span class="tier-none">—</span>' : ''}
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  function playerBoardData(pid) {
    const g = state.game;
    const scores = g.scores[pid] || {};
    const byTier = {};
    for (const id of g.order) {
      const t = scores[id];
      const item = itemById(id);
      if (t && item) (byTier[t] ||= []).push({ item });
    }
    return byTier;
  }

  function addPlayerForm(compact = false) {
    const full = state.players.length >= MAX_PLAYERS;
    return `
      <form class="add-player${compact ? ' compact' : ''}" data-form="add-player">
        <input name="name" type="text" maxlength="${NAME_MAX}" placeholder="${full ? 'Player limit reached' : 'New player name'}"
               aria-label="New player name" autocomplete="off" ${full ? 'disabled' : ''}>
        <button class="btn ${compact ? 'ghost' : 'secondary'}" type="submit" ${full ? 'disabled' : ''}>＋ Add${compact ? '' : ' player'}</button>
      </form>`;
  }

  function nameInput(p, small = false) {
    return `<input class="name-input${small ? ' sm' : ''}" type="text" value="${esc(p.name)}" maxlength="${NAME_MAX}"
              data-field="player-name" data-id="${p.id}" aria-label="Player name" autocomplete="off" spellcheck="false">`;
  }

  // ---------------------------------------------------------------------------
  // Rendering: nav
  // ---------------------------------------------------------------------------
  function renderNav() {
    const g = state.game;
    const tabs = [
      { key: 'setup', label: 'Setup', enabled: true },
      { key: 'play', label: g && g.finished ? 'Boards' : 'Play', enabled: !!g },
      { key: 'results', label: 'Results', enabled: !!g && scoreCount() > 0 },
    ];
    $nav.innerHTML = tabs.map((t) => `
      <button class="nav-btn" data-nav="${t.key}" ${t.enabled ? '' : 'disabled'}
              ${state.screen === t.key ? 'aria-current="page"' : ''}>${t.label}</button>`).join('');
  }

  // ---------------------------------------------------------------------------
  // Rendering: setup
  // ---------------------------------------------------------------------------
  function renderSetup() {
    const g = state.game;
    const inProgress = g && !g.finished;
    const selectedCount = state.selected.filter((id) => itemById(id)).length;
    const canStart = selectedCount > 0 && state.players.length > 0;
    const turns = selectedCount * state.players.length;

    const players = state.players.map((p) => `
      <li class="player-row">
        <button class="avatar-btn" data-action="cycle-color" data-id="${p.id}" title="Change color" aria-label="Change ${esc(displayName(p))}'s color">${avatar(p)}</button>
        ${nameInput(p)}
        <button class="icon-btn danger${ui.armed === `rm:${p.id}` ? ' armed' : ''}" data-action="remove-player" data-id="${p.id}"
                aria-label="Remove ${esc(displayName(p))}">${ui.armed === `rm:${p.id}` ? 'Remove?' : '✕'}</button>
      </li>`).join('');

    const items = state.items.map((i) => {
      const on = state.selected.includes(i.id);
      return `
        <div class="item-tile${on ? ' on' : ''}" data-item-id="${i.id}" data-type="${i.type}"
             data-search="${esc(`${i.name} ${i.desc || ''}`.toLowerCase())}">
          <button class="tile-main" data-action="toggle-item" data-id="${i.id}" aria-pressed="${on}">
            <span class="tile-emoji" aria-hidden="true">${esc(i.emoji)}</span>
            <span class="tile-text">
              <span class="tile-name">${esc(i.name)}</span>
              <span class="tile-desc">${esc(i.desc || '')}</span>
            </span>
            <span class="tile-check" aria-hidden="true">${on ? '✓' : ''}</span>
          </button>
          ${i.custom ? `<button class="tile-remove" data-action="remove-item" data-id="${i.id}" aria-label="Delete ${esc(i.name)}" title="Delete custom item">✕</button>` : ''}
        </div>`;
    }).join('');

    const startArmed = ui.armed === 'start';
    return `
      <section class="hero">
        <div class="hero-text">
          <p class="eyebrow">Indonesian food &amp; drink tier list</p>
          <h1>Rate the classics, <span class="accent">one bite at a time.</span></h1>
          <p class="lede">Add everyone sharing this computer, pick the dishes, then take turns. Each item goes round the table — every player drags it onto their own tier list from <b>1</b> (nope) to <b>10</b> (legendary).</p>
        </div>
        <ol class="steps">
          <li><span>1</span>Add players &amp; set names</li>
          <li><span>2</span>Choose foods &amp; drinks</li>
          <li><span>3</span>Take turns placing each one</li>
          <li><span>4</span>Compare the verdict</li>
        </ol>
      </section>

      ${inProgress ? `
        <div class="banner">
          <span>🍽️ A game is in progress — item ${g.itemIndex + 1} of ${g.order.length}.</span>
          <button class="btn primary sm" data-action="resume">Resume game</button>
        </div>` : ''}

      <div class="setup-grid">
        <section class="card">
          <header class="card-head">
            <h2>Players <span class="count">${state.players.length}</span></h2>
            <p class="muted">Click a name to rename. Click the circle to change color.</p>
          </header>
          ${state.players.length ? `<ul class="player-list">${players}</ul>` : '<p class="empty">No players yet — add someone below.</p>'}
          ${addPlayerForm()}
        </section>

        <section class="card items-card">
          <header class="card-head">
            <h2>Foods &amp; drinks <span class="count">${selectedCount} selected</span></h2>
            ${inProgress ? '<p class="muted">Changes here apply to the next game.</p>' : '<p class="muted">Tap to include or exclude.</p>'}
          </header>
          <div class="toolbar">
            <div class="seg" role="group" aria-label="Filter">
              ${[['all', 'All'], ['food', 'Makanan'], ['drink', 'Minuman']].map(([k, l]) =>
                `<button data-action="filter" data-id="${k}" aria-pressed="${ui.filter === k}">${l}</button>`).join('')}
            </div>
            <input class="search" type="search" placeholder="Search…" value="${esc(ui.search)}" data-field="search" aria-label="Search items">
            <div class="quick">
              <button class="btn ghost sm" data-action="select-all">All</button>
              <button class="btn ghost sm" data-action="select-none">None</button>
              <button class="btn ghost sm" data-action="select-random">🎲 Random 10</button>
            </div>
          </div>
          <div class="item-grid">${items}</div>
          <p class="empty no-match" hidden>Nothing matches that search.</p>
          <form class="add-item" data-form="add-item">
            <input name="emoji" type="text" maxlength="8" placeholder="🍽️" aria-label="Emoji" class="emoji-input" autocomplete="off">
            <input name="name" type="text" maxlength="32" placeholder="Add your own (e.g. Mie Ayam)" aria-label="Item name" autocomplete="off">
            <select name="type" aria-label="Type">
              <option value="food">Makanan</option>
              <option value="drink">Minuman</option>
            </select>
            <button class="btn secondary" type="submit">＋ Add item</button>
          </form>
        </section>
      </div>

      <section class="card start-card">
        <div class="settings">
          <label class="toggle">
            <input type="checkbox" data-field="setting" data-id="shuffle" ${state.settings.shuffle ? 'checked' : ''}>
            <span class="switch" aria-hidden="true"></span>
            <span><b>Shuffle order</b><small>Items come up in random order</small></span>
          </label>
          <label class="toggle">
            <input type="checkbox" data-field="setting" data-id="blind" ${state.settings.blind ? 'checked' : ''}>
            <span class="switch" aria-hidden="true"></span>
            <span><b>Blind mode</b><small>Hide other players' boards and show a "pass the computer" screen between turns</small></span>
          </label>
        </div>
        <div class="start">
          <p class="muted">${canStart
            ? `${selectedCount} item${selectedCount === 1 ? '' : 's'} × ${state.players.length} player${state.players.length === 1 ? '' : 's'} = <b>${turns} turns</b>`
            : (state.players.length ? 'Select at least one item to start.' : 'Add at least one player to start.')}</p>
          <button class="btn primary lg${startArmed ? ' armed' : ''}" data-action="start" ${canStart ? '' : 'disabled'}>
            ${inProgress ? (startArmed ? 'Click again — current game will be lost' : 'Start a new game') : 'Start tier list →'}
          </button>
        </div>
      </section>

      <footer class="foot">
        <button class="link-btn${ui.armed === 'reset' ? ' armed' : ''}" data-action="reset-all">
          ${ui.armed === 'reset' ? 'Click again to erase everything' : 'Reset everything'}
        </button>
        <span class="muted">Progress is saved in this browser automatically.</span>
      </footer>`;
  }

  function applyItemFilter() {
    const grid = $app.querySelector('.item-grid');
    if (!grid) return;
    const q = ui.search.trim().toLowerCase();
    let shown = 0;
    grid.querySelectorAll('.item-tile').forEach((el) => {
      const ok = (ui.filter === 'all' || el.dataset.type === ui.filter) && (!q || el.dataset.search.includes(q));
      el.hidden = !ok;
      if (ok) shown++;
    });
    const none = $app.querySelector('.no-match');
    if (none) none.hidden = shown > 0;
  }

  // ---------------------------------------------------------------------------
  // Rendering: play
  // ---------------------------------------------------------------------------
  function renderPlay() {
    const g = state.game;

    if (!state.players.length) {
      return `
        <section class="card empty-state">
          <h2>No players left</h2>
          <p class="muted">Add a player to keep the game going.</p>
          ${addPlayerForm()}
        </section>`;
    }

    if (g.finished) return renderBoardsOnly();

    const player = currentPlayer();
    const item = currentItem();
    if (g.handoff) return renderHandoff(player, item);

    const blind = state.settings.blind;
    const viewingId = !blind && g.viewing && playerById(g.viewing) ? g.viewing : player.id;
    const viewingSelf = viewingId === player.id;
    const viewed = playerById(viewingId);
    const totalTurns = g.order.length * state.players.length;
    const doneTurns = g.itemIndex * state.players.length + g.turnIndex;
    const pct = Math.round((doneTurns / totalTurns) * 100);
    const upNext = g.order.slice(g.itemIndex + 1, g.itemIndex + 4).map(itemById).filter(Boolean);

    const turnList = state.players.map((p, i) => {
      const done = g.scores[p.id]?.[item.id] != null;
      const now = i === g.turnIndex;
      const status = done ? 'done' : now ? 'now' : 'waiting';
      return `
        <li class="turn-row ${status}">
          <button class="avatar-btn" data-action="view-board" data-id="${p.id}" ${blind ? 'disabled' : ''}
                  title="${blind ? '' : `View ${esc(displayName(p))}'s board`}">${avatar(p, 'sm')}</button>
          ${nameInput(p, true)}
          <span class="turn-status" title="${status}">${done ? '✓' : now ? '▶' : ''}</span>
          <button class="icon-btn danger sm${ui.armed === `rm:${p.id}` ? ' armed' : ''}" data-action="remove-player" data-id="${p.id}"
                  aria-label="Remove ${esc(displayName(p))}">${ui.armed === `rm:${p.id}` ? '?' : '✕'}</button>
        </li>`;
    }).join('');

    const tabs = !blind && state.players.length > 1 ? `
      <div class="board-tabs" role="tablist" aria-label="Player boards">
        ${state.players.map((p) => `
          <button role="tab" class="board-tab" data-action="view-board" data-id="${p.id}"
                  aria-selected="${p.id === viewingId}" style="--c:${p.color}">
            ${avatar(p, 'xs')}<span>${esc(displayName(p))}</span>${p.id === player.id ? '<em>turn</em>' : ''}
          </button>`).join('')}
      </div>` : '';

    return `
      <section class="play-head">
        <div class="turn-banner" style="--c:${player.color}">
          ${avatar(player, 'lg')}
          <div>
            <p class="eyebrow">Item ${g.itemIndex + 1} of ${g.order.length}</p>
            <h1><span class="pname">${esc(displayName(player))}</span>'s turn</h1>
          </div>
        </div>
        <div class="progress" aria-label="Game progress ${pct}%">
          <div class="progress-bar"><i style="width:${pct}%"></i></div>
          <span>${doneTurns} / ${totalTurns} turns</span>
        </div>
      </section>

      <div class="play-grid">
        <aside class="stage card">
          <p class="stage-label">Now rating</p>
          <div class="pool${g.pending != null ? ' placed' : ''}" data-drop="pool">
            ${g.pending == null ? bigCard(item) : `
              <div class="pool-placed">
                <span class="food-emoji sm" aria-hidden="true">${esc(item.emoji)}</span>
                <p><b>${esc(item.name)}</b> placed in <span class="score-pill" style="${tierStyle(g.pending)}">${g.pending}</span></p>
                <p class="muted">Drag it to another tier, or drop it back here.</p>
              </div>`}
          </div>
          <div class="stage-actions">
            <button class="btn ghost" data-action="undo" ${g.pending == null && !g.history.length ? 'disabled' : ''} title="Undo (Backspace)">↶ Undo</button>
            <button class="btn primary" data-action="lock" ${g.pending == null ? 'disabled' : ''} title="Lock in (Enter)">
              ${g.pending == null ? 'Place it first' : `Lock in ${g.pending} ✓`}
            </button>
          </div>
          <p class="hint">Drag the card onto a tier — or click a tier, or press <kbd>1</kbd>–<kbd>9</kbd>, <kbd>0</kbd> for 10. <kbd>Enter</kbd> locks it in.</p>
          ${upNext.length ? `
            <div class="up-next">
              <p class="stage-label">Up next</p>
              <ul>${upNext.map((i) => `<li><span aria-hidden="true">${esc(i.emoji)}</span>${esc(i.name)}</li>`).join('')}</ul>
            </div>` : '<p class="stage-label last">Last item!</p>'}
        </aside>

        <section class="board-wrap">
          ${tabs}
          ${!viewingSelf ? `
            <div class="viewing-note">
              <span>Peeking at <b>${esc(displayName(viewed))}</b>'s board.</span>
              <button class="btn sm secondary" data-action="view-board" data-id="${player.id}">Back to ${esc(displayName(player))}'s board</button>
            </div>` : ''}
          ${board(playerBoardData(viewingId), {
            interactive: viewingSelf,
            pending: viewingSelf && g.pending != null ? { tier: g.pending, item } : null,
          })}
        </section>

        <aside class="turns card">
          <p class="stage-label">Turn order for ${esc(item.name)}</p>
          <ul class="turn-list">${turnList}</ul>
          ${addPlayerForm(true)}
          <p class="muted tiny">New players join from the current item on.</p>
        </aside>
      </div>`;
  }

  function renderHandoff(player, item) {
    const g = state.game;
    return `
      <section class="handoff" style="--c:${player.color}">
        <div class="handoff-card">
          ${avatar(player, 'xl')}
          <p class="eyebrow">Item ${g.itemIndex + 1} of ${g.order.length}</p>
          <h1>Pass the computer to <span class="pname">${esc(displayName(player))}</span></h1>
          <p class="muted">Everyone else, no peeking 👀</p>
          <button class="btn primary lg" data-action="reveal">I'm ${esc(displayName(player))} — show ${esc(item.emoji)} ${esc(item.name)}</button>
          <p class="muted tiny">or press <kbd>Enter</kbd></p>
        </div>
      </section>`;
  }

  function renderBoardsOnly() {
    return `
      <section class="results-head">
        <div>
          <p class="eyebrow">Game finished</p>
          <h1>Everyone's boards</h1>
        </div>
        <div class="head-actions">
          <button class="btn secondary" data-action="undo">↶ Undo last move</button>
          <button class="btn primary" data-nav="results">See the verdict →</button>
        </div>
      </section>
      ${renderAllBoards()}`;
  }

  function renderAllBoards() {
    return `
      <div class="boards-grid">
        ${state.players.map((p) => `
          <section class="card mini-board">
            <header class="mini-head">${avatar(p, 'sm')}<h3>${esc(displayName(p))}</h3></header>
            ${board(playerBoardData(p.id), { compact: true, emptyHint: true })}
          </section>`).join('')}
      </div>`;
  }

  // ---------------------------------------------------------------------------
  // Rendering: results
  // ---------------------------------------------------------------------------
  function renderResults() {
    const g = state.game;
    const { rows, playerStats, twins } = computeResults();
    const players = state.players;

    if (!rows.length) {
      return `<section class="card empty-state"><h2>No ratings yet</h2><button class="btn primary" data-nav="play">Go play</button></section>`;
    }

    const medals = ['🥇', '🥈', '🥉'];
    const podium = rows.slice(0, 3).map((r, i) => `
      <div class="podium-card p${i + 1}" style="${tierStyle(Math.max(1, Math.round(r.avg)))}">
        <span class="medal" aria-hidden="true">${medals[i]}</span>
        <span class="podium-emoji" aria-hidden="true">${esc(r.item.emoji)}</span>
        <span class="podium-name">${esc(r.item.name)}</span>
        <span class="podium-score">${fmt(r.avg)}</span>
      </div>`).join('');

    const stats = [];
    if (rows.length > 1) {
      const last = rows[rows.length - 1];
      stats.push({ icon: '💔', label: 'Bottom of the bowl', value: `${last.item.emoji} ${last.item.name}`, sub: `avg ${fmt(last.avg)}` });
    }
    const divisive = rows.filter((r) => r.count >= 2 && r.sd > 0).sort((a, b) => b.sd - a.sd)[0];
    if (divisive) {
      stats.push({ icon: '⚔️', label: 'Most divisive', value: `${divisive.item.emoji} ${divisive.item.name}`, sub: `scores from ${divisive.min} to ${divisive.max}` });
    }
    const unanimous = rows.find((r) => r.count >= 2 && r.sd === 0);
    if (unanimous) {
      stats.push({ icon: '🤝', label: 'Total agreement', value: `${unanimous.item.emoji} ${unanimous.item.name}`, sub: `everyone gave it ${unanimous.min}` });
    }
    if (twins) {
      stats.push({ icon: '👯', label: 'Taste twins', value: `${displayName(twins.a)} & ${displayName(twins.b)}`, sub: `only ${fmt(twins.diff)} apart on average` });
    }
    if (playerStats.length >= 2) {
      const sorted = [...playerStats].sort((a, b) => a.avg - b.avg);
      const harsh = sorted[0];
      const kind = sorted[sorted.length - 1];
      if (harsh.avg !== kind.avg) {
        stats.push({ icon: '🧂', label: 'Harshest critic', value: displayName(harsh.p), sub: `gives ${fmt(harsh.avg)} on average` });
        stats.push({ icon: '🍯', label: 'Most generous', value: displayName(kind.p), sub: `gives ${fmt(kind.avg)} on average` });
      }
    }

    const views = [['ranking', 'Ranking'], ['group', 'Group tier list'], ['boards', "Everyone's boards"]];
    let body = '';
    if (ui.resultsView === 'group') {
      const byTier = {};
      rows.forEach((r) => (byTier[Math.max(1, Math.round(r.avg))] ||= []).push({ item: r.item, score: fmt(r.avg) }));
      body = `<div class="group-board">${board(byTier, { emptyHint: true })}</div>`;
    } else if (ui.resultsView === 'boards') {
      body = renderAllBoards();
    } else {
      body = `
        <div class="table-wrap">
          <table class="rank-table">
            <thead>
              <tr>
                <th class="num">#</th>
                <th>Item</th>
                <th>Average</th>
                ${players.map((p) => `<th class="pcol" title="${esc(displayName(p))}">${avatar(p, 'xs')}<span>${esc(displayName(p))}</span></th>`).join('')}
                <th class="num">Range</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td class="num rank">${r.rank}</td>
                  <td class="item-cell"><span aria-hidden="true">${esc(r.item.emoji)}</span>${esc(r.item.name)}</td>
                  <td>
                    <div class="avg">
                      <b>${fmt(r.avg)}</b>
                      <span class="avg-bar"><i style="width:${r.avg * 10}%;background:${TIER_COLORS[Math.max(1, Math.round(r.avg))][0]}"></i></span>
                    </div>
                  </td>
                  ${players.map((p) => {
                    const v = r.per[p.id];
                    return `<td class="pcol">${v != null ? `<span class="score-pill" style="${tierStyle(v)}">${v}</span>` : '<span class="muted">–</span>'}</td>`;
                  }).join('')}
                  <td class="num muted">${r.min === r.max ? r.min : `${r.min}–${r.max}`}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }

    return `
      <section class="results-head">
        <div>
          <p class="eyebrow">${g.finished ? 'The verdict' : 'Partial results — game still in progress'}</p>
          <h1>${g.finished ? 'And the winner is…' : 'So far…'}</h1>
          <p class="muted">${rows.length} item${rows.length === 1 ? '' : 's'} rated by ${playerStats.length} player${playerStats.length === 1 ? '' : 's'}</p>
        </div>
        <div class="head-actions">
          ${g.finished
            ? `<button class="btn ghost" data-action="undo" ${g.history.length ? '' : 'disabled'}>↶ Undo last move</button>
               <button class="btn secondary" data-nav="setup">Change setup</button>
               <button class="btn primary${ui.armed === 'again' ? ' armed' : ''}" data-action="play-again">${ui.armed === 'again' ? 'Click again to restart' : '↻ Play again'}</button>`
            : `<button class="btn primary" data-nav="play">Resume game →</button>`}
        </div>
      </section>

      <section class="podium">${podium}</section>

      ${stats.length ? `
        <section class="stats">
          ${stats.map((s) => `
            <div class="stat card">
              <span class="stat-icon" aria-hidden="true">${s.icon}</span>
              <div>
                <p class="stat-label">${esc(s.label)}</p>
                <p class="stat-value">${esc(s.value)}</p>
                <p class="stat-sub">${esc(s.sub)}</p>
              </div>
            </div>`).join('')}
        </section>` : ''}

      <div class="seg results-seg" role="tablist" aria-label="Result views">
        ${views.map(([k, l]) => `<button role="tab" data-action="results-view" data-id="${k}" aria-selected="${ui.resultsView === k}" aria-pressed="${ui.resultsView === k}">${l}</button>`).join('')}
      </div>
      ${body}`;
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------
  function render() {
    if (state.screen === 'play' && !state.game) state.screen = 'setup';
    if (state.screen === 'results' && !(state.game && scoreCount() > 0)) {
      state.screen = state.game ? 'play' : 'setup';
    }
    renderNav();
    $app.dataset.screen = state.screen;
    if (state.screen === 'play') $app.innerHTML = renderPlay();
    else if (state.screen === 'results') $app.innerHTML = renderResults();
    else {
      $app.innerHTML = renderSetup();
      applyItemFilter();
    }
  }

  function go(screen) {
    if (screen === 'play' && !state.game) return;
    state.screen = screen;
    ui.armed = null;
    commit();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav && !nav.disabled) go(nav.dataset.nav);
  });

  $app.addEventListener('click', (e) => {
    if (Date.now() < ui.suppressClickUntil) return;
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const { action, id } = el.dataset;
    const g = state.game;

    switch (action) {
      // setup
      case 'cycle-color': cycleColor(id); commit(); break;
      case 'remove-player': {
        const p = playerById(id);
        const hasScores = g && Object.keys(g.scores[id] || {}).length > 0;
        const isCurrent = g && !g.finished && currentPlayer()?.id === id;
        if ((hasScores || isCurrent) && !confirmArmed(`rm:${id}`)) return;
        if (p) removePlayer(id);
        commit();
        break;
      }
      case 'toggle-item': {
        const i = state.selected.indexOf(id);
        if (i === -1) state.selected.push(id); else state.selected.splice(i, 1);
        commit();
        break;
      }
      case 'remove-item': removeCustomItem(id); commit(); break;
      case 'filter': ui.filter = id; render(); break;
      case 'select-all': {
        const ids = visibleItems().map((i) => i.id);
        state.selected = [...new Set([...state.selected, ...ids])];
        commit();
        break;
      }
      case 'select-none': {
        const ids = new Set(visibleItems().map((i) => i.id));
        state.selected = state.selected.filter((s) => !ids.has(s));
        commit();
        break;
      }
      case 'select-random': {
        const pool = visibleItems().map((i) => i.id);
        const keep = state.selected.filter((s) => !pool.includes(s));
        state.selected = [...keep, ...shuffle([...pool]).slice(0, 10)];
        commit();
        toast('Picked 10 at random');
        break;
      }
      case 'start':
        if (g && !g.finished && !confirmArmed('start')) return;
        startGame();
        commit();
        window.scrollTo({ top: 0 });
        break;
      case 'resume': go('play'); break;
      case 'reset-all':
        if (!confirmArmed('reset')) return;
        state = freshState();
        ui.filter = 'all';
        ui.search = '';
        commit();
        toast('Everything reset');
        break;

      // play
      case 'place': setPending(Number(el.dataset.tier)); break;
      case 'lock': lockIn(); break;
      case 'undo': undo(); break;
      case 'reveal': if (g) { g.handoff = false; commit(); } break;
      case 'view-board':
        if (g && !state.settings.blind) { g.viewing = id; commit(); }
        break;

      // results
      case 'results-view': ui.resultsView = id; render(); break;
      case 'play-again':
        if (!confirmArmed('again')) return;
        startGame();
        commit();
        window.scrollTo({ top: 0 });
        break;
    }
  });

  $app.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    if (form.dataset.form === 'add-player') {
      if (addPlayer(data.name)) {
        commit();
        $app.querySelector('[data-form="add-player"] input')?.focus();
      }
    } else if (form.dataset.form === 'add-item') {
      if (addCustomItem(data)) {
        ui.search = '';
        commit();
        $app.querySelector('[data-form="add-item"] input[name="name"]')?.focus();
      }
    }
  });

  // Live edits that must not re-render (keeps the caret in place).
  $app.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.field === 'player-name') {
      const p = playerById(t.dataset.id);
      if (!p) return;
      p.name = t.value.slice(0, NAME_MAX);
      const av = t.parentElement.querySelector('.avatar');
      if (av) av.textContent = initial(p);
      save();
    } else if (t.dataset.field === 'search') {
      ui.search = t.value;
      applyItemFilter();
    }
  });

  $app.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.field === 'player-name') {
      const p = playerById(t.dataset.id);
      if (p && !p.name.trim()) p.name = nextPlayerName();
      if (p) p.name = p.name.trim();
      commit();
    } else if (t.dataset.field === 'setting') {
      state.settings[t.dataset.id] = t.checked;
      commit();
    }
  });

  $app.addEventListener('keydown', (e) => {
    // Enter in a name field commits the rename.
    if (e.key === 'Enter' && e.target.dataset?.field === 'player-name') {
      e.preventDefault();
      e.target.blur();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (state.screen !== 'play' || !state.game || state.game.finished) return;
    if (e.target.closest('input, textarea, select') || e.ctrlKey && e.key !== 'z' || e.altKey || e.metaKey) return;
    const g = state.game;
    if (g.handoff) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        g.handoff = false;
        commit();
      }
      return;
    }
    if (/^[0-9]$/.test(e.key) && !e.ctrlKey) {
      setPending(e.key === '0' ? 10 : Number(e.key));
    } else if (e.key === 'Enter' && !e.target.closest('button')) {
      if (g.pending != null) { e.preventDefault(); lockIn(); }
    } else if (e.key === 'Escape') {
      if (g.pending != null) { g.pending = null; commit(); }
    } else if (e.key === 'Backspace' || (e.key === 'z' && e.ctrlKey)) {
      e.preventDefault();
      undo();
    }
  });

  // ---------------------------------------------------------------------------
  // Drag & drop (pointer events: works with mouse, pen and touch)
  // ---------------------------------------------------------------------------
  let drag = null;

  function dropTargetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest('[data-drop]') : null;
  }

  $app.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('[data-draggable]');
    if (!card || e.button !== 0 || !canPlace()) return;
    e.preventDefault();
    const rect = card.getBoundingClientRect();
    drag = {
      card,
      ghost: null,
      startX: e.clientX,
      startY: e.clientY,
      offX: e.clientX - rect.left,
      offY: e.clientY - rect.top,
      w: rect.width,
      h: rect.height,
      over: null,
      pointerId: e.pointerId,
    };
  });

  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4) return;
      const ghost = drag.card.cloneNode(true);
      ghost.classList.add('drag-ghost');
      ghost.removeAttribute('data-draggable');
      ghost.style.width = `${drag.w}px`;
      ghost.style.height = `${drag.h}px`;
      document.body.appendChild(ghost);
      drag.ghost = ghost;
      drag.card.classList.add('drag-source');
      document.body.classList.add('is-dragging');
    }
    drag.ghost.style.transform = `translate(${e.clientX - drag.offX}px, ${e.clientY - drag.offY}px) rotate(-3deg)`;
    const over = dropTargetAt(e.clientX, e.clientY);
    if (over !== drag.over) {
      drag.over?.classList.remove('drop-hover');
      over?.classList.add('drop-hover');
      drag.over = over;
    }
  });

  function endDrag(e, cancelled) {
    if (!drag || (e && e.pointerId !== drag.pointerId)) return;
    const { ghost, over, card } = drag;
    drag = null;
    document.body.classList.remove('is-dragging');
    card.classList.remove('drag-source');
    over?.classList.remove('drop-hover');
    if (!ghost) return; // it was a click, not a drag
    ghost.remove();
    ui.suppressClickUntil = Date.now() + 120;
    if (cancelled || !over) return;
    const target = over.dataset.drop;
    if (target === 'pool') {
      if (state.game.pending != null) { state.game.pending = null; commit(); }
    } else {
      setPending(Number(target));
    }
  }

  window.addEventListener('pointerup', (e) => endDrag(e, false));
  window.addEventListener('pointercancel', (e) => endDrag(e, true));

  // ---------------------------------------------------------------------------
  render();
})();
