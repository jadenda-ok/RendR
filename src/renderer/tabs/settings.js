// rendr — Settings tab: Overlay, Hotkeys, General, Updates, Data.
(function () {
  const TabSettings = (window.TabSettings = window.TabSettings || {});
  const App = window.App;
  const api = window.api;

  let recording = null; // 'toggle' | 'cycle'
  let lastFpsState = null;

  function overlaySettings() {
    return App.state.store.overlay || {};
  }
  function generalSettings() {
    return App.state.store.general || {};
  }
  function updatesSettings() {
    return App.state.store.updates || {};
  }

  function saveOverlay(patch) {
    api.patchStore('overlay', patch);
    Object.assign(App.state.store.overlay, patch);
    App.refreshSidebarStatus();
  }
  function saveGeneral(patch) {
    App.saveStoreKey('general', { ...generalSettings(), ...patch });
  }
  function saveUpdates(patch) {
    App.saveStoreKey('updates', { ...updatesSettings(), ...patch });
  }

  function bindToggle(id, get, set) {
    const el = document.getElementById(id);
    el.checked = !!get();
    el.addEventListener('change', () => set(el.checked));
  }

  // ---------------- hotkey recording ----------------
  function keyFromCode(code) {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
    if (code === 'Space') return 'Space';
    if (code === 'Tab') return 'Tab';
    if (code === 'Enter') return 'Enter';
    if (code === 'Escape') return null;
    if (code === 'Backspace') return 'Backspace';
    if (code === 'Delete') return 'Delete';
    if (code === 'Insert') return 'Insert';
    if (code === 'Home') return 'Home';
    if (code === 'End') return 'End';
    if (code === 'PageUp') return 'PageUp';
    if (code === 'PageDown') return 'PageDown';
    if (code === 'ArrowUp') return 'Up';
    if (code === 'ArrowDown') return 'Down';
    if (code === 'ArrowLeft') return 'Left';
    if (code === 'ArrowRight') return 'Right';
    return null;
  }

  function hotkeyFromEvent(e) {
    if (e.key === 'Escape') return null;
    const parts = [];
    if (e.ctrlKey) parts.push('Control');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    const key = keyFromCode(e.code);
    if (!key) return { combo: null, partial: true };
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return { combo: null, partial: true };
    parts.push(key);
    const isFKey = /^F\d+$/.test(key);
    const hasMod = e.ctrlKey || e.altKey || e.shiftKey;
    if (!hasMod && !isFKey) return { combo: null, partial: false, needMod: true };
    return { combo: parts.join('+') };
  }

  function startRecording(which) {
    if (recording) return;
    recording = which;
    const btn = document.getElementById(which === 'toggle' ? 'hk-toggle' : 'hk-cycle');
    btn.classList.add('recording');
    btn.textContent = 'Press keys...';
    const status = document.getElementById('hk-status');
    status.style.display = '';
    status.className = 'set-tip muted';
    status.textContent = 'Press a key combo (e.g. Ctrl+Alt+X). Esc cancels.';
    const onKey = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r = hotkeyFromEvent(e);
      if (r.combo === null) {
        if (r.partial) return; // only modifiers so far, keep listening
        if (r.needMod) {
          status.className = 'set-tip';
          status.style.color = 'var(--danger)';
          status.textContent = 'Add a modifier (Ctrl / Alt / Shift) or use an F-key.';
          return;
        }
        cancelRecording();
        return;
      }
      const res = await api.hotkeysSet(which, r.combo);
      if (res && res.ok) {
        saveOverlay(which === 'toggle' ? { toggleHotkey: res.combo } : { cycleHotkey: res.combo });
        cancelRecording();
        status.style.display = 'none';
        App.toast(`Hotkey set to ${res.combo}.`, 'ok');
      } else {
        status.className = 'set-tip';
        status.style.color = 'var(--danger)';
        status.textContent = (res && res.error) || 'Could not register that hotkey.';
      }
    };
    window.addEventListener('keydown', onKey, true);
    btn._onKey = onKey;
  }

  function cancelRecording() {
    const btn = document.getElementById(recording === 'toggle' ? 'hk-toggle' : 'hk-cycle');
    btn.classList.remove('recording');
    if (btn._onKey) {
      window.removeEventListener('keydown', btn._onKey, true);
      btn._onKey = null;
    }
    recording = null;
    refreshHotkeys();
  }

  function refreshHotkeys() {
    const o = overlaySettings();
    document.getElementById('hk-toggle').textContent = o.toggleHotkey || 'None';
    document.getElementById('hk-cycle').textContent = o.cycleHotkey || 'None';
  }

  // ---------------- fps indicator ----------------
  function fpsStatusText(st) {
    switch (st.state) {
      case 'running': return st.fps != null ? `${st.fps} FPS` : 'Measuring...';
      case 'waiting': return 'Waiting for Roblox';
      case 'starting': return 'Starting...';
      case 'denied': return 'Admin approval needed';
      case 'error': return 'Error';
      default: return 'Off';
    }
  }

  function fpsPillClass(st) {
    switch (st.state) {
      case 'running': return 'pill ok';
      case 'denied': case 'error': return 'pill err';
      case 'waiting': case 'starting': return 'pill warn';
      default: return 'pill info';
    }
  }

  function onFpsStatus(st) {
    const live = document.getElementById('fps-live');
    if (live) {
      live.textContent = fpsStatusText(st);
      live.className = fpsPillClass(st);
    }
    const msg = document.getElementById('fps-msg');
    if (msg) msg.textContent = st.message ? ' — ' + st.message : '';
    const retry = document.getElementById('btn-fps-retry');
    if (retry) retry.style.display = st.state === 'denied' || st.state === 'error' ? '' : 'none';
    if (st.state !== lastFpsState && (st.state === 'denied' || st.state === 'error')) {
      App.toast(
        st.state === 'denied'
          ? 'FPS indicator needs admin approval. Toggle it off and on again, then accept the UAC prompt.'
          : st.message || 'FPS indicator failed to start.',
        'err'
      );
    }
    lastFpsState = st.state;
  }

  // ---------------- updates ----------------
  function readFeedFields() {
    return {
      feedUrl: document.getElementById('set-feed-url').value.trim(),
      feedOwner: document.getElementById('set-feed-owner').value.trim(),
      feedRepo: document.getElementById('set-feed-repo').value.trim()
    };
  }

  function settingsUpdateText(st) {
    const el = document.getElementById('update-status');
    if (!el) return;
    if (!st) { el.textContent = 'Checks the feed baked into the build.'; return; }
    switch (st.state || st.status) {
      case 'checking': el.textContent = 'Checking for updates...'; break;
      case 'available': el.textContent = `Update v${st.version} available — downloading...`; break;
      case 'downloading': el.textContent = `Downloading v${st.version} (${st.percent || 0}%)...`; break;
      case 'downloaded': el.textContent = `Update v${st.version} ready to install.`; break;
      case 'none': case 'latest': el.textContent = `You're on the latest version (v${st.version}).`; break;
      case 'dev': el.textContent = 'Update checks only work in installed builds.'; break;
      case 'error': el.textContent = st.message || 'Update check failed.'; break;
      default: el.textContent = 'Checks the feed baked into the build.';
    }
    const btn = document.getElementById('btn-install-update-set');
    if (btn) btn.style.display = st && st.state === 'downloaded' ? '' : 'none';
  }

  function handleCheckResult(res) {
    if (res.status === 'dev') {
      settingsUpdateText({ state: 'dev' });
      return;
    }
    if (res.status === 'latest') {
      settingsUpdateText({ state: 'none', version: res.version });
      App.toast('You are on the latest version.', 'ok');
    } else if (res.status === 'available') {
      settingsUpdateText({ state: 'available', version: res.version });
      App.toast(`Update v${res.version} found. Downloading...`, 'ok');
    } else if (res.status === 'error') {
      settingsUpdateText({ state: 'error', message: res.message });
      App.toast(res.message || 'Update check failed.', 'err');
    }
  }

  // ---------------- refreshers ----------------
  function overlayRefresh() {
    const o = overlaySettings();
    document.getElementById('set-overlay-enabled').checked = !!o.enabled;
    document.getElementById('set-master-opacity').value = Math.round((o.masterOpacity ?? 1) * 100);
    document.getElementById('set-master-opacity-val').textContent = Math.round((o.masterOpacity ?? 1) * 100) + '%';
    document.getElementById('set-follow-mon').checked = !!o.followCursorMonitor;
    document.getElementById('set-only-roblox').checked = !!o.onlyWhenRobloxRunning;
    document.getElementById('set-fps').checked = !!o.fpsIndicator;
    const st = App.state.fps || { state: 'off' };
    onFpsStatus(st);
  }

  function hotkeysRefresh() {
    refreshHotkeys();
    document.getElementById('hk-status').style.display = 'none';
  }

  function generalRefresh() {
    const g = generalSettings();
    document.getElementById('set-startup').checked = !!g.startWithWindows;
    document.getElementById('set-close-tray').checked = !!g.closeToTray;
    document.getElementById('set-min-tray').checked = !!g.minimizeToTray;
  }

  function updatesRefresh() {
    const u = updatesSettings();
    document.getElementById('set-feed-url').value = u.feedUrl || '';
    document.getElementById('set-feed-owner').value = u.feedOwner || '';
    document.getElementById('set-feed-repo').value = u.feedRepo || '';
    settingsUpdateText(App.state.update);
  }

  function dataRefresh() {
    const info = App.state.info || {};
    document.getElementById('data-dir-path').textContent = info.dataDir || '—';
  }

  // ---------------- init ----------------
  document.addEventListener('app:ready', () => {
    App.registerRefresh('settings', 'overlay', overlayRefresh);
    App.registerRefresh('settings', 'hotkeys', hotkeysRefresh);
    App.registerRefresh('settings', 'general', generalRefresh);
    App.registerRefresh('settings', 'updates', updatesRefresh);
    App.registerRefresh('settings', 'data', dataRefresh);

    // ---- overlay page ----
    bindToggle('set-overlay-enabled', () => overlaySettings().enabled, (v) => {
      api.overlaySetEnabled(v);
      App.refreshSidebarStatus();
      App.toast(v ? 'Overlay enabled.' : 'Overlay hidden.', 'ok');
    });
    document.getElementById('set-master-opacity').addEventListener('input', (e) => {
      document.getElementById('set-master-opacity-val').textContent = e.target.value + '%';
      api.overlaySetMasterOpacity(parseInt(e.target.value, 10) / 100);
      Object.assign(App.state.store.overlay, { masterOpacity: parseInt(e.target.value, 10) / 100 });
    });
    bindToggle('set-follow-mon', () => overlaySettings().followCursorMonitor, (v) => saveOverlay({ followCursorMonitor: v }));
    bindToggle('set-only-roblox', () => overlaySettings().onlyWhenRobloxRunning, (v) => saveOverlay({ onlyWhenRobloxRunning: v }));
    bindToggle('set-fps', () => overlaySettings().fpsIndicator, (v) => {
      saveOverlay({ fpsIndicator: v }); // main process starts/stops the monitor
      if (v) App.toast('FPS indicator enabled. Accept the admin prompt if it appears.', 'ok');
      else App.toast('FPS indicator disabled.', 'ok');
    });
    document.getElementById('btn-fps-retry').addEventListener('click', () => {
      api.fpsRetry();
      App.toast('Restarting the FPS indicator. Accept the admin prompt if it appears.', 'ok');
    });

    // ---- hotkeys page ----
    document.getElementById('hk-toggle').addEventListener('click', () => startRecording('toggle'));
    document.getElementById('hk-cycle').addEventListener('click', () => startRecording('cycle'));

    // ---- general page ----
    bindToggle('set-startup', () => generalSettings().startWithWindows, (v) => {
      saveGeneral({ startWithWindows: v });
      api.setStartWithWindows(v);
    });
    bindToggle('set-close-tray', () => generalSettings().closeToTray, (v) => saveGeneral({ closeToTray: v }));
    bindToggle('set-min-tray', () => generalSettings().minimizeToTray, (v) => saveGeneral({ minimizeToTray: v }));

    // ---- updates page ----
    document.getElementById('set-feed-save').addEventListener('click', () => {
      saveUpdates(readFeedFields());
      App.toast('Update feed saved.', 'ok');
    });
    document.getElementById('btn-check-updates-set').addEventListener('click', async () => {
      saveUpdates(readFeedFields());
      settingsUpdateText({ state: 'checking' });
      const res = await api.updateCheck();
      handleCheckResult(res);
    });
    document.getElementById('btn-install-update-set').addEventListener('click', async () => {
      const res = await api.updateInstall();
      if (res && res.status === 'dev') App.toast('Update install only works in installed builds.', 'warn');
      else App.toast('Installing update and restarting...', 'ok');
    });

    // ---- data page ----
    document.getElementById('btn-open-data').addEventListener('click', () => api.openDataFolder());
    document.getElementById('btn-reset-app').addEventListener('click', async () => {
      if (!(await App.confirm('Reset everything', 'Restore all default settings, profiles and flags? This cannot be undone.', 'Reset'))) return;
      await api.resetApp();
      App.state.store = await api.getStore();
      App.refreshSidebarStatus();
      document.dispatchEvent(new Event('rendr:reset'));
      App.refreshCurrentPage();
      App.toast('Everything reset to defaults.', 'ok');
    });

    document.addEventListener('rendr:fps', (e) => {
      if (document.getElementById('page-settings-overlay').classList.contains('active')) onFpsStatus(e.detail);
    });
    document.addEventListener('rendr:update', (e) => {
      settingsUpdateText(e.detail);
    });
  });
})();
