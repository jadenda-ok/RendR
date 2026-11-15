// rendr — Home tab: Overview, Update Log, About.
(function () {
  const TabHome = (window.TabHome = window.TabHome || {});
  const App = window.App;
  const api = window.api;
  const esc = (s) => App.escapeHtml(s);
  const CHANGELOG = window.RENDR_CHANGELOG || [];

  // ---------------- update status (shared) ----------------
  function updateStatusText(st) {
    if (!st) return { text: 'Idle', sub: 'Rendr checks for updates automatically in installed builds.' };
    switch (st.state || st.status) {
      case 'checking': return { text: 'Checking for updates...', sub: '' };
      case 'available': return { text: `Update v${st.version} available`, sub: 'Downloading in the background. You can keep using Rendr.' };
      case 'downloading': return { text: `Downloading v${st.version}...`, sub: (st.percent != null ? st.percent + '%' : '') };
      case 'downloaded': return { text: `Update v${st.version} ready`, sub: 'Install to restart Rendr on the new version.' };
      case 'none': case 'latest': return { text: `You're on the latest version (v${st.version})`, sub: '' };
      case 'dev': return { text: 'Update checks only work in installed builds.', sub: '' };
      case 'portable': return { text: 'Portable build', sub: 'Open the releases page to download updates manually.' };
      case 'error': return { text: 'Update check failed', sub: st.message || '' };
      default: return { text: 'Idle', sub: '' };
    }
  }

  function renderUpdateSurfaces() {
    const st = App.state.update;
    const t = updateStatusText(st);
    const textEl = document.getElementById('upd-status-text');
    const subEl = document.getElementById('upd-status-sub');
    if (textEl) textEl.textContent = t.text;
    if (subEl) subEl.textContent = t.sub;
    const aboutEl = document.getElementById('about-upd-status');
    if (aboutEl) aboutEl.textContent = t.text + (t.sub ? ' — ' + t.sub : '');
    const ready = st && (st.state === 'downloaded' || st.state === 'available' || st.status === 'available');
    const instBtn = document.getElementById('btn-install-update');
    if (instBtn) instBtn.style.display = st && st.state === 'downloaded' ? '' : 'none';
    const prog = document.getElementById('upd-progress');
    if (prog && st && st.state === 'downloading') {
      prog.style.display = '';
      document.getElementById('upd-progress-fill').style.width = (st.percent || 0) + '%';
    } else if (prog) prog.style.display = 'none';
  }

  // ---------------- overview ----------------
  function overviewRefresh() {
    const info = App.state.info || {};
    document.getElementById('ov-version').textContent = 'v' + (info.version || '—');
    const o = App.state.store.overlay || {};
    const profiles = App.state.store.profiles || [];
    const prof = App.activeProfile();
    const grid = document.getElementById('kpi-grid');
    grid.innerHTML = '';

    const ICON = {
      crosshair: '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M12 3v5M12 16v5M3 12h5M16 12h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/></svg>',
      overlay: '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
      flags: '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M5 4h9l-1.6 4L14 12H5M5 4v17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M17 7h3l-1.2 3L20 13h-3" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>',
      fps: '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M4.5 14.5a7.5 7.5 0 1115 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 14.5l4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="14.5" r="1.5" fill="currentColor"/></svg>'
    };

    const kpi = (label, value, sub, icon, fn) => {
      const el = document.createElement('div');
      el.className = 'kpi';
      el.innerHTML = `<div class="kpi-top"><span class="kpi-label">${esc(label)}</span><span class="kpi-icon">${icon}</span></div><div class="kpi-value">${esc(value)}</div><div class="kpi-sub">${esc(sub)}</div>`;
      el.addEventListener('click', fn);
      grid.appendChild(el);
    };

    kpi('Active crosshair', prof ? prof.name : 'None', `${prof ? (prof.layers || []).length : 0} layer${(prof && prof.layers && prof.layers.length) === 1 ? '' : 's'} · ${profiles.length} saved`, ICON.crosshair,
      () => App.openPage('crosshair', 'studio'));
    kpi('Overlay', o.enabled ? 'On' : 'Off', 'Toggle: ' + (o.toggleHotkey || 'none'), ICON.overlay,
      () => api.overlaySetEnabled(!o.enabled));
    kpi('FastFlags', '—', 'Loading...', ICON.flags, () => App.openPage('fflags', 'library'));
    kpi('FPS', fpsText(), 'Roblox frame rate', ICON.fps, () => App.openPage('settings', 'overlay'));

    renderHeroStats('—');

    api.fflagsGetState().then((st) => {
      if (!st || !document.getElementById('kpi-grid')) return;
      const custom = App.state.store.fflags || {};
      const enabled = Object.keys(custom.enabled || {}).length;
      const kpis = grid.querySelectorAll('.kpi');
      if (kpis[2]) {
        kpis[2].querySelector('.kpi-value').textContent = st.exists ? `${enabled} active` : 'None set';
        kpis[2].querySelector('.kpi-sub').textContent = st.exists ? 'Written to ClientAppSettings.json' : 'Roblox settings file not present yet';
      }
      renderHeroStats(st.exists ? String(enabled) : '0');
    }).catch(() => {
      const kpis = grid.querySelectorAll('.kpi');
      if (kpis[2]) { kpis[2].querySelector('.kpi-value').textContent = '—'; kpis[2].querySelector('.kpi-sub').textContent = 'Could not read Roblox settings'; }
    });

    const quick = document.getElementById('ov-quick');
    quick.innerHTML = '';
    const quickItems = [
      { name: 'Crosshair Studio', sub: 'Design your crosshair', fn: () => App.openPage('crosshair', 'studio') },
      { name: 'Presets', sub: 'Browse built-in crosshairs', fn: () => App.openPage('crosshair', 'presets') },
      { name: 'FastFlags Library', sub: 'Tune the Roblox client', fn: () => App.openPage('fflags', 'library') },
      { name: 'Hotkeys', sub: 'Global overlay shortcuts', fn: () => App.openPage('settings', 'hotkeys') }
    ];
    for (const q of quickItems) {
      const el = document.createElement('div');
      el.className = 'quick-item';
      el.innerHTML = `<div><div class="quick-name">${esc(q.name)}</div><div class="quick-sub">${esc(q.sub)}</div></div><span class="quick-arrow">→</span>`;
      el.addEventListener('click', q.fn);
      quick.appendChild(el);
    }

    const news = document.getElementById('ov-news');
    news.innerHTML = '';
    const latest = CHANGELOG.find((c) => c.latest) || CHANGELOG[0];
    if (latest) {
      const el = document.createElement('div');
      el.className = 'news-item';
      el.innerHTML = `<div class="news-head"><span class="news-ver">v${esc(latest.version)}</span><span class="news-date">${esc(latest.date)}</span></div><ul class="news-notes">${(latest.notes || []).map((n) => '<li>' + esc(n) + '</li>').join('')}</ul>`;
      news.appendChild(el);
    }
    renderUpdateSurfaces();
  }

  function fpsText() {
    const st = App.state.fps;
    if (!st) return 'Off';
    switch (st.state) {
      case 'running': return st.fps != null ? st.fps + ' FPS' : 'Measuring...';
      case 'waiting': return 'Waiting';
      case 'starting': return 'Starting';
      case 'denied': return 'Needs UAC';
      case 'error': return 'Error';
      default: return 'Off';
    }
  }

  function renderHeroStats(flagsValue) {
    const el = document.getElementById('ov-hero-stats');
    if (!el) return;
    const o = App.state.store.overlay || {};
    const profiles = App.state.store.profiles || [];
    const stats = [
      { v: String(profiles.length), l: 'Crosshairs' },
      { v: o.enabled ? 'On' : 'Off', l: 'Overlay' },
      { v: fpsText(), l: 'FPS' },
      { v: flagsValue, l: 'Flags' }
    ];
    el.innerHTML = stats.map((s) => `<div class="ov-hero-stat"><span class="stat-value">${esc(s.v)}</span><span class="stat-label">${esc(s.l)}</span></div>`).join('');
  }

  // ---------------- update log ----------------
  function updatesRefresh() {
    renderUpdateSurfaces();
    const log = document.getElementById('upd-log');
    log.innerHTML = '';
    for (const c of CHANGELOG) {
      const el = document.createElement('div');
      el.className = 'upd-entry';
      el.innerHTML = `<div class="news-head"><span class="news-ver">v${esc(c.version)}</span><span class="news-date">${esc(c.date)}</span>${c.latest ? '<span class="gallery-badge active">Latest</span>' : ''}</div><ul class="news-notes">${(c.notes || []).map((n) => '<li>' + esc(n) + '</li>').join('')}</ul>`;
      log.appendChild(el);
    }
  }

  // ---------------- about ----------------
  function aboutRefresh() {
    document.getElementById('about-version').textContent = 'v' + ((App.state.info || {}).version || '—');
    renderUpdateSurfaces();
  }

  // ---------------- events ----------------
  document.addEventListener('app:ready', () => {
    App.registerRefresh('home', 'overview', overviewRefresh);
    App.registerRefresh('home', 'updates', updatesRefresh);
    App.registerRefresh('home', 'about', aboutRefresh);

    document.getElementById('ov-open-studio').addEventListener('click', () => App.openPage('crosshair', 'studio'));
    document.getElementById('ov-check-updates').addEventListener('click', async () => {
      document.getElementById('ov-check-updates').textContent = 'Checking...';
      const res = await api.updateCheck();
      document.getElementById('ov-check-updates').textContent = 'Check for Updates';
      if (res.status === 'available') App.toast(`Update v${res.version} found. Downloading...`, 'ok');
      else if (res.status === 'latest') App.toast('You are on the latest version.', 'ok');
      else if (res.status === 'error') App.toast(res.message || 'Update check failed.', 'err');
      else if (res.status === 'dev') App.toast('Update checks only work in installed builds.', 'warn');
      App.openPage('home', 'updates');
    });
    document.getElementById('btn-check-updates').addEventListener('click', async () => {
      document.getElementById('upd-status-text').textContent = 'Checking for updates...';
      const res = await api.updateCheck();
      if (res.status === 'available') App.toast(`Update v${res.version} found. Downloading...`, 'ok');
      else if (res.status === 'latest') App.toast('You are on the latest version.', 'ok');
      else if (res.status === 'error') App.toast(res.message || 'Update check failed.', 'err');
      renderUpdateSurfaces();
    });
    document.getElementById('btn-install-update').addEventListener('click', async () => {
      const res = await api.updateInstall();
      if (res && res.status === 'dev') App.toast('Update install only works in installed builds.', 'warn');
      else App.toast('Installing update and restarting...', 'ok');
    });
    document.getElementById('btn-about-update').addEventListener('click', async () => {
      const el = document.getElementById('about-upd-status');
      el.textContent = 'Checking for updates...';
      const res = await api.updateCheck();
      if (res.status === 'dev') el.textContent = 'Update checks only work in installed builds.';
      else if (res.status === 'latest') el.textContent = `You're on the latest version (v${res.version}).`;
      else if (res.status === 'available') el.textContent = `Update v${res.version} available — downloading.`;
      else if (res.status === 'error') el.textContent = res.message || 'Update check failed.';
    });
    document.getElementById('btn-about-data').addEventListener('click', () => api.openDataFolder());

    document.addEventListener('rendr:update', renderUpdateSurfaces);
    document.addEventListener('rendr:fps', overviewRefresh);
  });
})();
