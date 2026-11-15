const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  globalShortcut,
  screen,
  shell,
  nativeImage,
  dialog
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Store, DEFAULTS } = require('./store');
const { OverlayManager } = require('./overlay-manager');
const fflags = require('./fflags');
const roblox = require('./roblox');
const updater = require('./updater');
const { FpsMonitor } = require('./fps');

const SMOKE = process.argv.includes('--smoke-test');

let mainWin = null;
let tray = null;
let quitting = false;
let store = null;
let overlay = null;
let fps = null;

// build/ is not packaged into app.asar; the renderer assets are.
const ICON_PATH = path.join(__dirname, '..', 'renderer', 'logo.png');
const TRAY_ICON_PATH = path.join(__dirname, '..', 'renderer', 'tray.png');

// ---------------- FastFlags file parsing (import) ----------------

// Coerce a raw value to bool/int/float/string based on the FastFlag name's
// type prefix (FFlag/DFFlag = bool, FInt/DFInt = int, FLog = string, ...),
// so Bloxstrap-style files with string values like "True" or "60" still work.
function coerceByName(name, value) {
  if (name === undefined || value === undefined) return undefined;
  if (/^(DF)?Flag/i.test(name)) {
    return typeof value === 'string' ? /^true$/i.test(value) : value === true;
  }
  if (/^(DF)?Int/i.test(name)) {
    const n = parseInt(String(value), 10);
    return Number.isNaN(n) ? value : n;
  }
  return value;
}

// Parse a FastFlags file: .json (flat map or array of {name,value}) or .txt
// (one flag per line: Name=Value, Name:true, "Name" "Value"). Lines starting
// with #, // or ; are comments.
function parseFastFlagFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json' || /^\s*[[{]/.test(text)) {
    const raw = JSON.parse(text);
    const flags = {};
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const name = item.name || item.flag || item.Flag || item.Name;
        const value = item.value != null ? item.value : item.defaultValue;
        if (name && value !== undefined) flags[name] = coerceByName(name, value);
      }
    } else if (raw && typeof raw === 'object') {
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') {
          flags[k] = coerceByName(k, v);
        }
      }
    }
    if (!Object.keys(flags).length) throw new Error('No flags found in JSON file.');
    return flags;
  }
  const flags = {};
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('//') || line.startsWith(';')) continue;
    let name, valueStr;
    const eq = line.indexOf('=');
    const colon = line.indexOf(':');
    if (eq !== -1 && (colon === -1 || eq < colon)) {
      name = line.slice(0, eq).trim();
      valueStr = line.slice(eq + 1).trim();
    } else if (colon !== -1) {
      name = line.slice(0, colon).trim();
      valueStr = line.slice(colon + 1).trim();
    } else {
      const parts = line.split(/\s+/);
      name = parts[0];
      valueStr = parts.slice(1).join(' ');
    }
    if (!name) continue;
    name = name.replace(/^["']|["']$/g, '').trim();
    if (!/^(F|D)[A-Za-z0-9_]+/.test(name)) continue; // sanity: FastFlag names start with F/D
    // Allow a trailing comma (people paste JSON fragments into .txt files).
    valueStr = valueStr.replace(/,$/, '').trim();
    const value = coerceFlagValue(valueStr);
    if (value === '') continue;
    flags[name] = coerceByName(name, value);
  }
  if (!Object.keys(flags).length) throw new Error('No flags found in file. Expected lines like "FlagName=true" or "FlagName: 240".');
  return flags;
}

function coerceFlagValue(str) {
  const s = String(str).trim().replace(/^["']|["']$/g, '');
  if (/^(true|false)$/i.test(s)) return s.toLowerCase() === 'true';
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
  return s;
}

// ---------------- Icons ----------------

function trayImage() {
  const src = nativeImage.createFromPath(TRAY_ICON_PATH);
  if (src.isEmpty()) return src;
  // One representation per common display scale keeps the tray icon crisp.
  const img = nativeImage.createEmpty();
  for (const scaleFactor of [1, 1.25, 1.5, 2]) {
    const px = Math.round(16 * scaleFactor);
    img.addRepresentation({ scaleFactor, buffer: src.resize({ width: px, height: px, quality: 'best' }).toPNG() });
  }
  return img;
}

// ---------------- Windows ----------------

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1060,
    minHeight: 680,
    frame: false,
    backgroundColor: '#0c0c0d',
    show: false,
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWin.once('ready-to-show', () => {
    mainWin.show();
    if (!app.isPackaged) mainWin.webContents.openDevTools({ mode: 'detach' });
  });

  mainWin.on('close', (e) => {
    if (!quitting && store.get('general').closeToTray) {
      e.preventDefault();
      mainWin.hide();
    }
  });

  mainWin.on('minimize', (e) => {
    if (store.get('general').minimizeToTray) {
      e.preventDefault();
      mainWin.hide();
    }
  });

  mainWin.on('closed', () => {
    mainWin = null;
  });
}

function showMain() {
  if (!mainWin) {
    createMainWindow();
    return;
  }
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
}

function createTray() {
  try {
    tray = new Tray(trayImage());
    tray.setToolTip('Rendr — Roblox Crosshair Studio');
    const menu = Menu.buildFromTemplate([
      { label: 'Open Rendr', click: showMain },
      {
        label: 'Toggle Overlay',
        click: () => setOverlayEnabled(!store.get('overlay').enabled)
      },
      { label: 'Cycle Crosshair', click: cycleProfile },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true;
          app.quit();
        }
      }
    ]);
    tray.setContextMenu(menu);
    tray.on('click', showMain);
  } catch (e) {
    console.error('tray failed', e);
  }
}

// ---------------- Profiles / overlay ----------------

function activeProfile() {
  const profiles = store.get('profiles') || [];
  const id = store.get('activeProfileId');
  return profiles.find((p) => p.id === id) || profiles[0] || null;
}

function cycleProfile() {
  const profiles = store.get('profiles') || [];
  if (!profiles.length) return;
  const currentId = store.get('activeProfileId');
  const idx = Math.max(0, profiles.findIndex((p) => p.id === currentId));
  applyProfile(profiles[(idx + 1) % profiles.length]);
}

function applyProfile(profile) {
  store.set('activeProfileId', profile ? profile.id : null);
  // Always push — a null profile must clear the overlay too.
  overlay.setProfile(profile);
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('app:activeProfile', profile);
  }
}

// Single source of truth for overlay on/off: updates the store + overlay and
// tells the renderer so every surface (sidebar chip, settings, tabs) agrees.
function setOverlayEnabled(enabled) {
  overlay.setVisibility(enabled);
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('overlay:enabled', store.get('overlay').enabled);
  }
}

// ---------------- Hotkeys ----------------

const MODIFIERS = new Set(['Control', 'Alt', 'Shift', 'Super']);

function isValidHotkey(combo) {
  if (typeof combo !== 'string' || !combo || combo.length > 60) return false;
  const parts = combo.split('+').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return false;
  for (const p of parts) {
    if (MODIFIERS.has(p)) continue;
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(p)) continue;
    if (/^[A-Za-z0-9]$/.test(p)) continue;
    if (['Plus', 'Space', 'Tab', 'Enter', 'Escape', 'Backspace', 'Delete', 'Insert',
      'Home', 'End', 'PageUp', 'PageDown', 'Up', 'Down', 'Left', 'Right'].includes(p)) continue;
    return false;
  }
  const hasModifier = parts.some((p) => MODIFIERS.has(p));
  const isFKey = /^F\d+$/.test(parts[parts.length - 1]);
  return hasModifier || isFKey;
}

// Register one binding; returns {ok, error}. Rolls back to the previous combo
// when the new one is already taken by another app.
function registerHotkey(which, combo) {
  const key = which === 'toggle' ? 'toggleHotkey' : 'cycleHotkey';
  const o = store.get('overlay');
  const previous = o[key] || '';
  const cb = which === 'toggle' ? () => setOverlayEnabled(!store.get('overlay').enabled) : cycleProfile;

  if (previous) {
    try { globalShortcut.unregister(previous); } catch { /* ignore */ }
  }
  try {
    if (combo && !globalShortcut.register(combo, cb)) {
      if (previous) {
        try { globalShortcut.register(previous, cb); } catch { /* ignore */ }
      }
      return { ok: false, error: `"${combo}" is already in use by another app.` };
    }
    store.patch('overlay', { [key]: combo || '' });
    return { ok: true, combo: combo || '' };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  const o = store.get('overlay');
  if (o.toggleHotkey) registerHotkey('toggle', o.toggleHotkey);
  if (o.cycleHotkey) registerHotkey('cycle', o.cycleHotkey);
}

// ---------------- IPC ----------------

function registerIpc() {
  ipcMain.handle('store:get', () => store.get());
  ipcMain.handle('store:set', (e, key, value) => {
    store.set(key, value);
    if (key === 'overlay') {
      overlay.sendVisibility();
      registerHotkeys();
    }
    return true;
  });
  ipcMain.handle('store:patch', (e, key, partial) => {
    store.patch(key, partial);
    if (key === 'overlay') {
      overlay.sendVisibility();
      registerHotkeys();
      if (partial.fpsIndicator !== undefined && fps) fps.setEnabled(!!partial.fpsIndicator);
    }
    return store.get(key);
  });

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    dataDir: app.getPath('userData'),
    platform: process.platform,
    username: (() => { try { return os.userInfo().username; } catch { return ''; } })(),
    roblox: {
      settingsPath: roblox.CLIENT_SETTINGS_FILE,
      playerExe: roblox.findPlayerExe(),
      studioExe: roblox.findStudioExe()
    }
  }));

  ipcMain.handle('app:setStartWithWindows', (e, enable) => {
    const opts = { openAtLogin: !!enable };
    // The portable build runs from a temp extraction folder; register the real exe.
    if (process.env.PORTABLE_EXECUTABLE_FILE) opts.path = process.env.PORTABLE_EXECUTABLE_FILE;
    app.setLoginItemSettings(opts);
    return true;
  });

  ipcMain.handle('app:openDataFolder', () => {
    shell.openPath(app.getPath('userData'));
    return true;
  });

  ipcMain.handle('app:openExternal', (e, url) => {
    if (/^https?:\/\//i.test(String(url))) shell.openExternal(String(url));
    return true;
  });

  ipcMain.handle('app:reset', () => {
    store.data = structuredClone(DEFAULTS);
    store.flushSync();
    store.seedPresets();
    overlay.setProfile(activeProfile());
    overlay.sendVisibility();
    registerHotkeys();
    if (fps) fps.setEnabled(false);
    try {
      const opts = { openAtLogin: false };
      if (process.env.PORTABLE_EXECUTABLE_FILE) opts.path = process.env.PORTABLE_EXECUTABLE_FILE;
      app.setLoginItemSettings(opts);
    } catch { /* ignore */ }
    return true;
  });

  // Window controls
  ipcMain.on('win:minimize', () => mainWin && mainWin.minimize());
  ipcMain.on('win:close', () => mainWin && mainWin.close());
  ipcMain.on('win:toggleMaximize', () => {
    if (!mainWin) return;
    if (mainWin.isMaximized()) mainWin.unmaximize();
    else mainWin.maximize();
  });

  // Overlay
  ipcMain.handle('overlay:toggle', () => {
    setOverlayEnabled(!store.get('overlay').enabled);
    return store.get('overlay').enabled;
  });
  ipcMain.handle('overlay:setEnabled', (e, enabled) => {
    setOverlayEnabled(!!enabled);
    return store.get('overlay').enabled;
  });
  ipcMain.handle('overlay:applyProfile', (e, profile) => {
    applyProfile(profile);
    return true;
  });
  ipcMain.handle('overlay:preview', (e, profile, seconds) => {
    overlay.previewForSeconds(profile, Math.min(Number(seconds) || 5, 15));
    return true;
  });
  ipcMain.handle('overlay:setMasterOpacity', (e, value) => {
    store.patch('overlay', { masterOpacity: Number(value) });
    overlay.sendVisibility();
    return true;
  });

  // Hotkeys
  ipcMain.handle('hotkeys:set', (e, which, combo) => {
    if (which !== 'toggle' && which !== 'cycle') return { ok: false, error: 'Unknown hotkey.' };
    if (!isValidHotkey(combo)) return { ok: false, error: 'Use at least one modifier key (Ctrl/Alt/Shift) plus a key, e.g. Ctrl+Alt+X.' };
    return registerHotkey(which, combo);
  });

  // Profiles
  ipcMain.handle('profiles:export', async (e, profile) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWin, {
        title: 'Export crosshair profile',
        defaultPath: `${(profile.name || 'crosshair').replace(/[^\w\- ]+/g, '')}.rendr.json`,
        filters: [{ name: 'Rendr Crosshair Profile', extensions: ['json'] }]
      });
      if (canceled || !filePath) return { ok: false };
      fs.writeFileSync(filePath, JSON.stringify(profile, null, 2));
      return { ok: true, filePath };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  });

  ipcMain.handle('profiles:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWin, {
      title: 'Import crosshair profile',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths || !filePaths.length) return { ok: false };
    try {
      const raw = JSON.parse(fs.readFileSync(filePaths[0], 'utf8').replace(/^\uFEFF/, ''));
      if (!raw || !Array.isArray(raw.layers)) throw new Error('Invalid profile file');
      return { ok: true, profile: raw };
    } catch (err) {
      return { ok: false, error: String(err.message) };
    }
  });

  ipcMain.handle('profiles:exportImage', async (e, dataUrl) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWin, {
        title: 'Export crosshair image',
        defaultPath: 'crosshair.png',
        filters: [{ name: 'PNG Image', extensions: ['png'] }]
      });
      if (canceled || !filePath) return { ok: false };
      const b64 = String(dataUrl).split(',')[1];
      fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
      return { ok: true, filePath };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  });

  ipcMain.handle('layer:pickImage', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWin, {
      title: 'Choose a crosshair image',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths || !filePaths.length) return { ok: false };
    try {
      const ext = path.extname(filePaths[0]).toLowerCase();
      if (ext === '.svg') {
        const svg = fs.readFileSync(filePaths[0], 'utf8');
        return { ok: true, dataUrl: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') };
      }
      const data = fs.readFileSync(filePaths[0]);
      if (data.length > 5 * 1024 * 1024) return { ok: false, error: 'Image is too large (max 5 MB).' };
      const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[ext] || 'image/png';
      return { ok: true, dataUrl: `data:${mime};base64,` + data.toString('base64') };
    } catch (err) {
      return { ok: false, error: String(err.message) };
    }
  });

  // FastFlags
  ipcMain.handle('fflags:getState', () => fflags.getState(store.get('fflags').custom));
  ipcMain.handle('fflags:apply', (e, enabled, customFlags, launch) =>
    fflags.apply(enabled, customFlags, { launch: !!launch })
  );
  ipcMain.handle('fflags:backup', () => fflags.backup());
  ipcMain.handle('fflags:restore', async (e, backupPath) => {
    let file = backupPath;
    if (!file) {
      const backups = fflags.listBackups();
      if (!backups.length) return { error: 'No backups found.' };
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWin, {
        title: 'Restore FastFlags backup',
        defaultPath: backups[0],
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile']
      });
      if (canceled || !filePaths || !filePaths.length) return { ok: false, canceled: true };
      file = filePaths[0];
    }
    return fflags.restore(file);
  });
  ipcMain.handle('fflags:clear', () => fflags.clearAll(store.get('fflags').custom));
  ipcMain.handle('fflags:openFolder', () => {
    shell.openPath(roblox.CLIENT_SETTINGS_DIR);
    return true;
  });
  ipcMain.handle('fflags:launchRoblox', () => roblox.launchRoblox());
  ipcMain.handle('fflags:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWin, {
      title: 'Import FastFlags from file',
      filters: [
        { name: 'FastFlags files', extensions: ['json', 'txt'] },
        { name: 'All files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    if (canceled || !filePaths || !filePaths.length) return { ok: false, canceled: true };
    try {
      const flags = parseFastFlagFile(filePaths[0]);
      return { ok: true, flags, filePath: filePaths[0] };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('fflags:export', async (e, flags) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWin, {
        title: 'Export FastFlags JSON',
        defaultPath: 'ClientAppSettings.json',
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });
      if (canceled || !filePath) return { ok: false };
      fs.writeFileSync(filePath, JSON.stringify(flags, null, 2));
      return { ok: true, filePath };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  });

  // Roblox status (dashboard)
  ipcMain.handle('roblox:status', async () => ({
    running: await roblox.isRobloxRunning(),
    playerExe: roblox.findPlayerExe(),
    settingsExists: fs.existsSync(roblox.CLIENT_SETTINGS_FILE)
  }));

  // FPS indicator
  ipcMain.handle('fps:retry', () => {
    if (fps) fps.setEnabled(true);
    return true;
  });

  // Updates
  ipcMain.handle('update:check', () => updater.check(false));
  ipcMain.handle('update:install', () => updater.install());
  ipcMain.handle('update:status', () => updater.status());
}

// ---------------- App lifecycle ----------------

// Isolated data dir for tests (RENDR_USERDATA_DIR=...) — must be set before
// the single-instance lock so a running installed copy doesn't block test runs.
if (process.env.RENDR_USERDATA_DIR) {
  app.setPath('userData', process.env.RENDR_USERDATA_DIR);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showMain);

  app.whenReady().then(() => {
    try {
      app.setAppUserModelId('com.rendr.app');
    } catch { /* ignore */ }

    store = new Store();
    store.seedPresets();

    // The old Killbox build kept a Roblox sign-in session in an embedded
    // browser profile. The sign-in system is gone; drop the stored session.
    try {
      fs.rmSync(path.join(app.getPath('appData'), 'Killbox', 'Partitions'), { recursive: true, force: true });
    } catch { /* locked by a running old instance or already gone */ }

    overlay = new OverlayManager(store);
    overlay.create();
    overlay.setProfile(activeProfile());
    overlay.startWatchers();

    fps = new FpsMonitor(store);
    fps.onStatus = (st) => {
      if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('fps:status', st);
      overlay.send('overlay:fps', { fps: st.state === 'running' ? st.fps : null });
    };
    if (store.get('overlay').fpsIndicator) fps.setEnabled(true);

    createMainWindow();
    createTray();
    registerHotkeys();
    registerIpc();
    updater.start(() => mainWin, store);

    if (SMOKE) {
      setTimeout(() => {
        console.log(trayImage().isEmpty() ? 'SMOKE_FAIL tray icon missing' : 'SMOKE_OK');
        app.exit(0);
      }, 4000);
    }
  });

  app.on('window-all-closed', () => {
    // keep running in tray on Windows
  });

  app.on('before-quit', () => {
    quitting = true;
    globalShortcut.unregisterAll();
    if (store) store.flushSync();
  });

  app.on('will-quit', () => {
    if (overlay) overlay.destroy();
    if (fps) fps.stop();
  });
}
