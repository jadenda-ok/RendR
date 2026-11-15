// rendr — app shell: router, sidebar, titlebar, toasts, modals, IPC wiring.
(function () {
  const App = (window.App = window.App || {});
  const Engine = window.CrosshairEngine;
  const api = window.api;

  App.state = { store: null, info: null, fps: null, update: null };
  App.toast = toast;
  App.confirm = confirmModal;
  App.promptModal = promptModal;
  App.saveStoreKey = saveStoreKey;
  App.openPage = openPage;
  App.switchTab = switchTab;
  App.refreshSidebarStatus = refreshSidebarStatus;
  App.registerRefresh = registerRefresh;
  App.refreshCurrentPage = refreshCurrentPage;
  App.renderProfileThumb = renderProfileThumb;

  // ---------------- section config ----------------
  const ICONS = {
    overview: '<svg viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="3" width="8" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="3" width="8" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="13" width="8" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="13" width="8" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    updates: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M20 12a8 8 0 11-2.34-5.66M20 4v4h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    about: '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v5M12 8v.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    studio: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 3v5M12 16v5M3 12h5M16 12h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
    presets: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 3l2.4 5.6L20 11l-5.6 2.4L12 19l-2.4-5.6L4 11l5.6-2.4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    profiles: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 3h10l4 4v14H5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M15 3v5h5M9 13h6M9 17h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    library: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 4h14v16H5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 9h6M9 13h6M9 17h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    custom: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    backups: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 3a8 8 0 00-7.6 10.5L3 17l4.2-.9A8 8 0 1012 3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.5 12.5l1.8 1.8 3.6-3.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    settingsOverlay: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 12h4M11 12h8M5 6h8M15 6h4M5 18h4M11 18h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="13" cy="6" r="1.6" fill="currentColor"/><circle cx="10" cy="12" r="1.6" fill="currentColor"/><circle cx="10" cy="18" r="1.6" fill="currentColor"/></svg>',
    hotkeys: '<svg viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="6" width="18" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 10h.01M12 10h.01M17 10h.01M7 14h.01M12 14h.01M17 14h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    general: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    data: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 3C7 3 4 5 4 8v8c0 3 3 5 8 5s8-2 8-5V8c0-3-3-5-8-5z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4 12c0 3 3 5 8 5s8-2 8-5" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>'
  };

  const SECTIONS = {
    home: {
      title: 'Home',
      pages: [
        { id: 'overview', label: 'Overview', icon: 'overview' },
        { id: 'updates', label: 'Update Log', icon: 'updates' },
        { id: 'about', label: 'About', icon: 'about' }
      ]
    },
    crosshair: {
      title: 'Crosshair',
      pages: [
        { id: 'studio', label: 'Studio', icon: 'studio' },
        { id: 'presets', label: 'Presets', icon: 'presets' },
        { id: 'profiles', label: 'My Crosshairs', icon: 'profiles' }
      ]
    },
    fflags: {
      title: 'FastFlags',
      pages: [
        { id: 'library', label: 'Library', icon: 'library' },
        { id: 'custom', label: 'Custom', icon: 'custom' },
        { id: 'backups', label: 'Backups', icon: 'backups' }
      ]
    },
    settings: {
      title: 'Settings',
      pages: [
        { id: 'overlay', label: 'Overlay', icon: 'settingsOverlay' },
        { id: 'hotkeys', label: 'Hotkeys', icon: 'hotkeys' },
        { id: 'general', label: 'General', icon: 'general' },
        { id: 'updates', label: 'Updates', icon: 'updates' },
        { id: 'data', label: 'Data', icon: 'data' }
      ]
    }
  };

  const refreshers = {}; // 'section-page' -> fn
  function registerRefresh(section, page, fn) {
    refreshers[section + '-' + page] = fn;
  }

  let currentSection = 'home';
  let currentPage = 'overview';

  // ---------------- toasts ----------------
  function toast(msg, kind = 'info', ms = 3200) {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    const dot = document.createElement('span');
    dot.className = 'dot';
    el.appendChild(dot);
    el.appendChild(document.createTextNode(msg));
    root.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 250);
    }, ms);
  }

  // ---------------- modals ----------------
  function modalShell(title, message, inputValue) {
    const root = document.getElementById('modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal">' +
      '<h3></h3><p></p>' +
      (inputValue != null ? '<input type="text" class="input modal-input" />' : '') +
      '<div class="modal-actions"><button class="btn ghost" data-act="cancel">Cancel</button><button class="btn primary" data-act="ok">OK</button></div>' +
      '</div>';
    overlay.querySelector('h3').textContent = title;
    overlay.querySelector('p').textContent = message;
    const input = overlay.querySelector('.modal-input');
    if (input) input.value = inputValue;
    root.appendChild(overlay);
    return new Promise((resolve) => {
      const done = (val) => {
        overlay.remove();
        document.removeEventListener('keydown', onKey, true);
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') done(null);
        if (e.key === 'Enter' && input) done(input.value.trim());
      };
      document.addEventListener('keydown', onKey, true);
      overlay.querySelector('[data-act="cancel"]').onclick = () => done(null);
      overlay.querySelector('[data-act="ok"]').onclick = () => done(input ? input.value.trim() : true);
      if (input) input.focus();
    });
  }

  function confirmModal(title, message, confirmLabel = 'OK') {
    const root = document.getElementById('modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal"><h3></h3><p></p>' +
      '<div class="modal-actions"><button class="btn ghost" data-act="cancel">Cancel</button><button class="btn primary" data-act="ok"></button></div></div>';
    overlay.querySelector('h3').textContent = title;
    overlay.querySelector('p').textContent = message;
    overlay.querySelector('[data-act="ok"]').textContent = confirmLabel;
    root.appendChild(overlay);
    return new Promise((resolve) => {
      const done = (val) => {
        overlay.remove();
        document.removeEventListener('keydown', onKey, true);
        resolve(val);
      };
      const onKey = (e) => { if (e.key === 'Escape') done(false); };
      document.addEventListener('keydown', onKey, true);
      overlay.querySelector('[data-act="cancel"]').onclick = () => done(false);
      overlay.querySelector('[data-act="ok"]').onclick = () => done(true);
    });
  }

  function promptModal(title, message, def = '') {
    return modalShell(title, message, def);
  }

  // ---------------- store helpers ----------------
  function saveStoreKey(key, value) {
    api.setStore(key, value);
    App.state.store[key] = value;
  }

  // ---------------- router ----------------
  function openPage(section, page) {
    const sec = SECTIONS[section];
    if (!sec) return;
    if (!sec.pages.some((p) => p.id === page)) page = sec.pages[0].id;
    currentSection = section;
    currentPage = page;
    document.querySelectorAll('.page').forEach((el) => el.classList.remove('active'));
    const el = document.getElementById('page-' + section + '-' + page);
    if (el) el.classList.add('active');
    document.getElementById('sb-section-title').textContent = sec.title;
    document.querySelectorAll('.sb-item').forEach((n) => {
      n.style.display = n.dataset.section === section ? '' : 'none';
      n.classList.toggle('active', n.dataset.section === section && n.dataset.page === page);
    });
    document.querySelectorAll('.tb-tab').forEach((b) => b.classList.toggle('active', b.dataset.section === section));
    document.getElementById('content').scrollTop = 0;
    const fn = refreshers[section + '-' + page];
    if (fn) fn();
  }

  function switchTab(section) {
    if (!SECTIONS[section]) return;
    const first = SECTIONS[section].pages[0].id;
    openPage(section, currentSection === section ? currentPage : first);
  }

  function refreshCurrentPage() {
    const fn = refreshers[currentSection + '-' + currentPage];
    if (fn) fn();
  }

  function buildSidebar() {
    const nav = document.getElementById('sb-nav');
    const links = document.getElementById('sb-links');
    for (const [secKey, sec] of Object.entries(SECTIONS)) {
      for (const page of sec.pages) {
        const b = document.createElement('button');
        b.className = 'sb-item';
        b.dataset.page = page.id;
        b.dataset.section = secKey;
        b.style.display = 'none';
        b.innerHTML = (ICONS[page.icon] || '') + '<span>' + escapeHtml(page.label) + '</span>';
        b.addEventListener('click', () => openPage(secKey, page.id));
        nav.appendChild(b);
      }
    }
    const linkDefs = [
      { label: 'Roblox ClientSettings folder', act: () => api.fflagsOpenFolder() },
      { label: 'Rendr data folder', act: () => api.openDataFolder() }
    ];
    for (const l of linkDefs) {
      const b = document.createElement('button');
      b.className = 'sb-link';
      b.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 7h9M4 12h9M4 17h5M16 7h4M16 12h4M16 17h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span>' + escapeHtml(l.label) + '</span>';
      b.addEventListener('click', l.act);
      links.appendChild(b);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  App.escapeHtml = escapeHtml;

  // ---------------- sidebar chip ----------------
  function activeProfile() {
    const profiles = App.state.store.profiles || [];
    const id = App.state.store.activeProfileId;
    return profiles.find((p) => p.id === id) || profiles[0] || null;
  }
  App.activeProfile = activeProfile;

  function renderProfileThumb(canvas, profile, size) {
    const ctx = canvas.getContext('2d');
    canvas.width = size;
    canvas.height = size;
    ctx.clearRect(0, 0, size, size);
    if (!profile) return;
    ctx.save();
    ctx.translate(size / 2, size / 2);
    const scale = Math.min(size / 80, 1.6);
    ctx.scale(scale, scale);
    ctx.translate(-size / 2, -size / 2);
    Engine.draw(ctx, profile, size, size, 0);
    ctx.restore();
  }

  function refreshSidebarStatus() {
    const chip = document.getElementById('sb-chip');
    const o = App.state.store.overlay || {};
    const prof = activeProfile();
    const name = document.getElementById('sb-chip-name');
    const sub = document.getElementById('sb-chip-sub');
    const sw = document.getElementById('sb-chip-switch');
    name.textContent = o.enabled ? (prof ? prof.name : 'No crosshair') : 'Overlay off';
    sub.textContent = o.toggleHotkey || 'No hotkey';
    sw.checked = !!o.enabled;
    chip.style.opacity = o.enabled ? 1 : 0.55;
    renderProfileThumb(document.getElementById('sb-chip-canvas'), prof, 44);
  }

  // ---------------- fps status ----------------
  function applyFpsStatus(st) {
    App.state.fps = st;
    document.dispatchEvent(new CustomEvent('rendr:fps', { detail: st }));
  }

  // ---------------- update status ----------------
  function applyUpdateStatus(st) {
    App.state.update = st;
    document.dispatchEvent(new CustomEvent('rendr:update', { detail: st }));
    const badgeEl = document.querySelector('.sb-item[data-page="updates"] .badge');
    if (st && st.state === 'available') {
      if (!badgeEl) {
        const b = document.querySelector('.sb-item[data-page="updates"]');
        if (b) { const s = document.createElement('span'); s.className = 'badge'; s.textContent = 'NEW'; b.appendChild(s); }
      }
    } else if (badgeEl) badgeEl.remove();
  }

  // ---------------- init ----------------
  async function init() {
    App.state.store = await api.getStore();
    App.state.info = await api.getInfo();

    buildSidebar();

    document.getElementById('tb-min').addEventListener('click', () => api.winMinimize());
    document.getElementById('tb-max').addEventListener('click', () => api.winToggleMaximize());
    document.getElementById('tb-close').addEventListener('click', () => api.winClose());
    document.querySelectorAll('.tb-tab').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.section)));
    document.getElementById('sb-collapse').addEventListener('click', () => {
      document.body.classList.toggle('sb-collapsed');
      document.getElementById('sb-collapse').title = document.body.classList.contains('sb-collapsed') ? 'Expand sidebar' : 'Collapse sidebar';
    });

    const chip = document.getElementById('sb-chip');
    chip.addEventListener('click', (e) => {
      if (e.target.closest('.switch')) return;
      openPage('crosshair', 'studio');
    });
    document.getElementById('sb-chip-switch').addEventListener('change', (e) => {
      api.overlaySetEnabled(e.target.checked);
    });

    api.on('app:activeProfile', (profile) => {
      const idx = (App.state.store.profiles || []).findIndex((p) => p.id === (profile && profile.id));
      if (profile && idx !== -1) App.state.store.profiles[idx] = profile;
      App.state.store.activeProfileId = profile ? profile.id : null;
      document.dispatchEvent(new CustomEvent('rendr:activeProfile', { detail: profile }));
      refreshSidebarStatus();
    });
    api.on('overlay:enabled', (enabled) => {
      App.state.store.overlay.enabled = enabled;
      document.dispatchEvent(new CustomEvent('rendr:overlayEnabled', { detail: enabled }));
      refreshSidebarStatus();
    });
    api.on('fps:status', applyFpsStatus);
    api.on('update:status', applyUpdateStatus);

    refreshSidebarStatus();
    try { App.state.update = await api.updateStatus(); applyUpdateStatus(App.state.update); } catch { /* fine */ }

    openPage('home', 'overview');
    document.dispatchEvent(new Event('app:ready'));
    refreshCurrentPage();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
