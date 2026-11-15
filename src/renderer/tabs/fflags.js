// rendr — FastFlags tab: Library, Custom flags, Backups.
(function () {
  const TabFFlags = (window.TabFFlags = window.TabFFlags || {});
  const App = window.App;
  const api = window.api;
  const LIBRARY = window.FFLAGS_LIBRARY || [];
  const esc = (s) => App.escapeHtml(s);

  let searchTerm = '';
  let currentCategory = 'All';
  let lastState = null;

  function fflagsStore() {
    return App.state.store.fflags || { enabled: {}, custom: [] };
  }
  function enabledFlags() {
    return fflagsStore().enabled || {};
  }
  function customFlags() {
    return fflagsStore().custom || [];
  }
  function saveFFlags(ff) {
    App.state.store.fflags = ff;
    api.setStore('fflags', ff);
  }
  function entryFor(name) {
    return LIBRARY.find((f) => f.name === name) || customFlags().find((c) => c.name === name);
  }
  function activeCount() {
    return Object.keys(enabledFlags()).length;
  }

  // ---------------- controls ----------------
  function valueDisplay(entry, value) {
    if (entry.type === 'bool') return value ? 'True' : 'False';
    return String(value);
  }

  function controlFor(entry, enabledValue) {
    const isOn = enabledValue !== undefined;
    if (entry.type === 'bool') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = isOn ? enabledValue === true : false;
      input.addEventListener('change', () => {
        const ff = fflagsStore();
        if (input.checked) ff.enabled[entry.name] = true;
        else delete ff.enabled[entry.name];
        saveFFlags(ff);
        renderStatus();
      });
      return input;
    }
    if (entry.type === 'enum') {
      const sel = document.createElement('select');
      sel.className = 'input';
      const off = document.createElement('option');
      off.value = '';
      off.textContent = 'Default';
      sel.appendChild(off);
      for (const opt of entry.options || []) {
        const o = document.createElement('option');
        o.value = String(opt);
        o.textContent = String(opt);
        sel.appendChild(o);
      }
      if (isOn) sel.value = String(enabledValue);
      sel.addEventListener('change', () => {
        const ff = fflagsStore();
        if (!sel.value) delete ff.enabled[entry.name];
        else ff.enabled[entry.name] = sel.value;
        saveFFlags(ff);
        renderStatus();
      });
      return sel;
    }
    const input = document.createElement('input');
    input.className = 'input';
    input.type = entry.type === 'string' ? 'text' : 'number';
    if (entry.type === 'int') { input.step = 1; }
    if (entry.type === 'float') { input.step = 'any'; }
    if (entry.min != null) input.min = entry.min;
    if (entry.max != null) input.max = entry.max;
    input.placeholder = entry.type === 'string' ? 'Default' : String(entry.default);
    if (isOn) input.value = enabledValue;
    input.addEventListener('change', () => {
      const ff = fflagsStore();
      if (input.value === '') delete ff.enabled[entry.name];
      else if (entry.type === 'int') ff.enabled[entry.name] = parseInt(input.value, 10);
      else if (entry.type === 'float') ff.enabled[entry.name] = parseFloat(input.value);
      else ff.enabled[entry.name] = input.value;
      saveFFlags(ff);
      renderStatus();
    });
    return input;
  }

  // ---------------- library list ----------------
  function renderList() {
    const list = document.getElementById('ff-list');
    list.innerHTML = '';
    const enabled = enabledFlags();
    const customs = customFlags();
    const entries = [
      ...LIBRARY.map((f) => ({ ...f, custom: false })),
      ...customs.map((c) => ({ ...c, custom: true, category: 'Custom', description: c.description || 'Custom flag' }))
    ].filter((f) => (currentCategory === 'All' || f.category === currentCategory));

    const q = searchTerm.toLowerCase();
    const shown = entries.filter((f) => !q || f.name.toLowerCase().includes(q) || (f.description || '').toLowerCase().includes(q));

    if (!shown.length) {
      list.innerHTML = '<div class="muted" style="text-align:center;padding:26px">No flags match.</div>';
      return;
    }
    for (const entry of shown) {
      const row = document.createElement('div');
      row.className = 'ff-row';
      row.innerHTML =
        `<div class="ff-info"><div class="ff-name"></div><div class="ff-desc"></div></div>` +
        `<span class="ff-cat"></span>` +
        `<span class="ff-default muted"></span>`;
      row.querySelector('.ff-name').textContent = entry.name;
      row.querySelector('.ff-desc').textContent = entry.description || '';
      row.querySelector('.ff-cat').textContent = entry.custom ? 'Custom' : entry.category;
      row.querySelector('.ff-default').textContent = entry.type === 'bool' ? 'default: ' + (entry.default ? 'true' : 'false') : 'default: ' + String(entry.default);
      const ctl = document.createElement('div');
      ctl.className = 'ff-ctl';
      ctl.appendChild(controlFor(entry, enabled[entry.name]));
      if (entry.custom) {
        const del = document.createElement('button');
        del.className = 'btn mini danger-text';
        del.textContent = 'Remove';
        del.addEventListener('click', async () => {
          if (!(await App.confirm('Remove custom flag', `Remove "${entry.name}" from your custom flags?`))) return;
          const ff = fflagsStore();
          ff.custom = ff.custom.filter((x) => x.name !== entry.name);
          delete ff.enabled[entry.name];
          saveFFlags(ff);
          renderList();
          renderCustomList();
          renderCategories();
          renderStatus();
        });
        ctl.appendChild(del);
      }
      row.appendChild(ctl);
      list.appendChild(row);
    }
  }

  function renderCategories() {
    const cats = ['All', ...new Set(LIBRARY.map((f) => f.category))];
    if (customFlags().length) cats.push('Custom');
    const wrap = document.getElementById('ff-categories');
    wrap.innerHTML = '';
    for (const c of cats) {
      const chip = document.createElement('button');
      chip.className = 'chip' + (c === currentCategory ? ' active' : '');
      chip.textContent = c;
      chip.addEventListener('click', () => {
        currentCategory = c;
        renderCategories();
        renderList();
      });
      wrap.appendChild(chip);
    }
  }

  // ---------------- status bar ----------------
  function renderStatus() {
    const el = document.getElementById('fflags-status');
    const pathEl = document.getElementById('fflags-path');
    if (!el) return;
    const count = activeCount();
    if (!lastState) {
      el.innerHTML = '<span class="dot"></span><span>Checking Roblox settings...</span>';
      if (pathEl) pathEl.textContent = '';
      return;
    }
    const st = lastState;
    const parts = [];
    if (st.exists) {
      parts.push(`<span class="dot ok"></span><span>ClientAppSettings.json present</span>`);
    } else {
      parts.push(`<span class="dot warn"></span><span>ClientAppSettings.json not created yet — Apply to create it</span>`);
    }
    parts.push(`<span class="muted">·</span><span>${count} flag${count === 1 ? '' : 's'} enabled</span>`);
    if (!st.playerExe) parts.push(`<span class="muted">·</span><span style="color:var(--danger)">Roblox Player not found</span>`);
    el.innerHTML = parts.join(' ');
    el.title = st.settingsPath || '';
    if (pathEl) pathEl.textContent = st.settingsPath || '';
  }

  async function loadState() {
    try {
      lastState = await api.fflagsGetState();
    } catch {
      lastState = null;
    }
    renderStatus();
  }

  // ---------------- custom list ----------------
  function renderCustomList() {
    const el = document.getElementById('cf-list');
    const customs = customFlags();
    el.innerHTML = '';
    if (!customs.length) {
      el.innerHTML = '<div class="muted" style="padding:10px">No custom flags yet. Add one above or import from a file.</div>';
      return;
    }
    const enabled = enabledFlags();
    for (const c of customs) {
      const row = document.createElement('div');
      row.className = 'custom-row';
      row.innerHTML = `<span class="ff-name"></span>`;
      row.querySelector('.ff-name').textContent = c.name;
      const typeSel = document.createElement('select');
      typeSel.className = 'input';
      for (const t of ['bool', 'int', 'float', 'string']) {
        const o = document.createElement('option');
        o.value = t;
        o.textContent = t;
        typeSel.appendChild(o);
      }
      typeSel.value = c.type || 'string';
      typeSel.addEventListener('change', () => {
        c.type = typeSel.value;
        saveFFlags(fflagsStore());
      });
      row.appendChild(typeSel);
      const input = document.createElement('input');
      input.className = 'input';
      input.type = 'text';
      input.value = enabled[c.name] !== undefined ? String(enabled[c.name]) : (c.default !== undefined ? String(c.default) : '');
      input.placeholder = 'off';
      input.addEventListener('change', () => {
        const ff = fflagsStore();
        if (input.value.trim() === '') delete ff.enabled[c.name];
        else {
          const raw = input.value.trim();
          if (c.type === 'bool') ff.enabled[c.name] = raw.toLowerCase() === 'true';
          else if (c.type === 'int') ff.enabled[c.name] = parseInt(raw, 10);
          else if (c.type === 'float') ff.enabled[c.name] = parseFloat(raw);
          else ff.enabled[c.name] = raw;
        }
        saveFFlags(ff);
        renderStatus();
      });
      row.appendChild(input);
      const del = document.createElement('button');
      del.className = 'btn mini danger-text';
      del.textContent = 'Remove';
      del.addEventListener('click', async () => {
        const ff = fflagsStore();
        ff.custom = ff.custom.filter((x) => x.name !== c.name);
        delete ff.enabled[c.name];
        saveFFlags(ff);
        renderCustomList();
        renderList();
        renderCategories();
        renderStatus();
      });
      row.appendChild(del);
      el.appendChild(row);
    }
  }

  function addCustomFlag() {
    const nameEl = document.getElementById('cf-name');
    const typeEl = document.getElementById('cf-type');
    const valueEl = document.getElementById('cf-value');
    const name = nameEl.value.trim();
    const type = typeEl.value;
    const rawValue = valueEl.value.trim();
    if (!name) return App.toast('Enter a flag name.', 'err');
    if (entryFor(name)) return App.toast('That flag name already exists.', 'err');

    let value;
    if (rawValue !== '') {
      if (type === 'bool') value = rawValue.toLowerCase() === 'true';
      else if (type === 'int') {
        value = parseInt(rawValue, 10);
        if (Number.isNaN(value)) return App.toast('Integer value required.', 'err');
      } else if (type === 'float') {
        value = parseFloat(rawValue);
        if (Number.isNaN(value)) return App.toast('Numeric value required.', 'err');
      } else value = rawValue;
    }

    const ff = fflagsStore();
    ff.custom.push({ name, type, description: 'Custom flag', default: value });
    if (value !== undefined) ff.enabled[name] = value;
    saveFFlags(ff);
    nameEl.value = '';
    valueEl.value = '';
    renderCustomList();
    renderList();
    renderCategories();
    renderStatus();
    App.toast('Custom flag added.', 'ok');
  }

  // ---------------- actions ----------------
  async function applyFlags(launch) {
    const ff = fflagsStore();
    App.toast('Writing flags to Roblox...');
    const res = await api.fflagsApply(ff.enabled, ff.custom, launch);
    if (res && res.error) {
      App.toast('Apply failed: ' + res.error, 'err');
    } else {
      const count = res && res.written ? Object.keys(res.written).length : Object.keys(ff.enabled).length;
      App.toast(`Applied ${count} flag(s) to ClientAppSettings.json.${launch ? ' Launching Roblox...' : ''}`, 'ok');
    }
    await loadState();
  }

  // ---------------- backups ----------------
  function renderBackups() {
    const el = document.getElementById('ff-backups');
    if (!lastState || !lastState.backups) {
      el.innerHTML = '<div class="muted" style="padding:10px">No backups yet.</div>';
      return;
    }
    const paths = lastState.backups.slice(0, 30).reverse();
    el.innerHTML = '';
    if (!paths.length) {
      el.innerHTML = '<div class="muted" style="padding:10px">No backups yet. Click "Create Backup" to snapshot your current settings.</div>';
      return;
    }
    for (const p of paths) {
      const name = String(p).split(/[\\/]/).pop();
      const row = document.createElement('div');
      row.className = 'ff-row ff-backup-row';
      row.innerHTML = `<div class="ff-backup-name"><div class="ff-name"></div><div class="ff-backup-time muted"></div></div>`;
      row.querySelector('.ff-name').textContent = name;
      const m = /(\d{4})(\d{2})(\d{2})[^\d]*(\d{2})(\d{2})(\d{2})/.exec(name);
      if (m) row.querySelector('.ff-backup-time').textContent = `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
      const restore = document.createElement('button');
      restore.className = 'btn mini outline';
      restore.textContent = 'Restore';
      restore.addEventListener('click', async () => {
        if (!(await App.confirm('Restore backup', 'Replace ClientAppSettings.json with this backup?', 'Restore'))) return;
        const res = await api.fflagsRestore(p);
        if (res && res.error) App.toast(res.error, 'err');
        else {
          App.toast('ClientAppSettings.json restored from backup.', 'ok');
          await loadState();
        }
      });
      row.appendChild(restore);
      el.appendChild(row);
    }
  }

  // ---------------- refreshers ----------------
  function libraryRefresh() {
    renderStatus();
    renderCategories();
    renderList();
  }
  function customRefresh() {
    renderCustomList();
    renderStatus();
  }
  function backupsRefresh() {
    loadState().then(renderBackups);
  }

  // ---------------- init ----------------
  document.addEventListener('app:ready', () => {
    App.registerRefresh('fflags', 'library', libraryRefresh);
    App.registerRefresh('fflags', 'custom', customRefresh);
    App.registerRefresh('fflags', 'backups', backupsRefresh);

    document.getElementById('ff-search').addEventListener('input', (e) => {
      searchTerm = e.target.value.trim().toLowerCase();
      renderList();
    });
    document.getElementById('ff-apply').addEventListener('click', () => applyFlags(false));
    document.getElementById('ff-apply-launch').addEventListener('click', () => applyFlags(true));
    document.getElementById('ff-launch').addEventListener('click', async () => {
      try {
        await api.fflagsLaunchRoblox();
        App.toast('Launching Roblox...', 'ok');
      } catch {
        App.toast('Could not launch Roblox. Is it installed?', 'err');
      }
    });
    document.getElementById('ff-import').addEventListener('click', async () => {
      const res = await api.fflagsImport();
      if (!res || res.canceled) return;
      if (!res.ok) return App.toast('Import failed: ' + (res.error || 'unknown error'), 'err');
      const ff = fflagsStore();
      let added = 0;
      for (const [name, value] of Object.entries(res.flags || {})) {
        if (!entryFor(name)) {
          const type = typeof value === 'boolean' ? 'bool'
            : typeof value === 'number' ? (Number.isInteger(value) ? 'int' : 'float')
            : 'string';
          ff.custom.push({ name, type, description: 'Imported from file', default: value });
          added++;
        }
        ff.enabled[name] = value;
      }
      saveFFlags(ff);
      renderList();
      renderCustomList();
      renderCategories();
      renderStatus();
      App.toast(`Imported ${Object.keys(res.flags || {}).length} flag(s) (${added} new custom). Click Apply to write them.`, 'ok');
    });
    document.getElementById('ff-export').addEventListener('click', async () => {
      const ff = fflagsStore();
      const res = await api.fflagsExport(ff.enabled);
      if (res && res.ok) App.toast('Exported to ' + res.filePath, 'ok');
    });
    document.getElementById('cf-add').addEventListener('click', addCustomFlag);
    document.getElementById('cf-import-file').addEventListener('click', () => {
      document.getElementById('ff-import').click();
    });
    document.getElementById('cf-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addCustomFlag();
    });
    document.getElementById('ff-backup').addEventListener('click', async () => {
      const res = await api.fflagsBackup();
      if (res && res.error) App.toast(res.error, 'warn');
      else App.toast('Backup created.', 'ok');
      await loadState();
      renderBackups();
    });
    document.getElementById('ff-restore').addEventListener('click', async () => {
      const res = await api.fflagsRestore(null);
      if (res && res.canceled) return;
      if (res && res.error) App.toast(res.error, 'err');
      else App.toast('ClientAppSettings.json restored from backup.', 'ok');
      await loadState();
      renderBackups();
    });
    document.getElementById('ff-open-folder').addEventListener('click', () => api.fflagsOpenFolder());
    document.getElementById('ff-clear').addEventListener('click', async () => {
      if (!(await App.confirm('Clear managed flags', 'Remove all Rendr-managed flags from ClientAppSettings.json? Other entries are left untouched.', 'Clear'))) return;
      const res = await api.fflagsClear();
      if (res && res.error) App.toast(res.error, 'err');
      else App.toast('Managed flags cleared.', 'ok');
      await loadState();
    });

    loadState().then(() => {
      renderStatus();
      renderBackups();
    });

    document.addEventListener('rendr:reset', () => {
      lastState = null;
      loadState().then(() => {
        renderStatus();
        renderList();
        renderCustomList();
        renderCategories();
        renderBackups();
      });
    });
  });
})();
