const fs = require('fs');
const path = require('path');
const roblox = require('./roblox');
const LIBRARY = require('../shared/fflags-library');

function getLibrary() {
  return LIBRARY;
}

// Keys this app manages: every library flag plus every custom flag the user added.
function managedKeys(customFlags) {
  const keys = new Set(LIBRARY.map((f) => f.name));
  for (const f of customFlags || []) keys.add(f.name);
  return [...keys];
}

function coerceValue(entry, value) {
  switch (entry.type) {
    case 'bool':
      // Accept real booleans and Bloxstrap-style string booleans ("True"/"False").
      return typeof value === 'string' ? /^true$/i.test(value) : value === true;
    case 'int': {
      const n = parseInt(value, 10);
      if (Number.isNaN(n)) return null;
      if (entry.min != null) return Math.max(entry.min, Math.min(entry.max ?? Infinity, n));
      return n;
    }
    case 'float': {
      const n = parseFloat(value);
      if (Number.isNaN(n)) return null;
      if (entry.min != null) return Math.max(entry.min, Math.min(entry.max ?? Infinity, n));
      return n;
    }
    case 'string':
      return String(value ?? '');
    case 'enum':
      return String(value ?? '');
    default:
      return value;
  }
}

// Build the final map of flags to write: enabled library/custom flags with coerced values.
function buildEnabledMap(enabled, customFlags) {
  const out = {};
  const byName = new Map(LIBRARY.map((f) => [f.name, f]));
  for (const f of customFlags || []) byName.set(f.name, f);

  for (const [name, value] of Object.entries(enabled || {})) {
    const entry = byName.get(name);
    if (!entry) continue;
    const v = coerceValue(entry, value);
    if (v === null) continue;
    out[name] = v;
  }
  return out;
}

function apply(enabled, customFlags, { launch = false } = {}) {
  try {
    const enabledMap = buildEnabledMap(enabled, customFlags);
    let existing = roblox.readClientSettings();
    if (existing && existing.__error) existing = {};

    const keys = new Set(managedKeys(customFlags));
    for (const key of keys) {
      if (!(key in enabledMap)) delete existing[key];
    }
    Object.assign(existing, enabledMap);
    roblox.writeClientSettings(existing);

    if (launch) {
      return roblox.launchRoblox().then((r) => ({ file: roblox.CLIENT_SETTINGS_FILE, written: enabledMap, launch: r }));
    }
    return Promise.resolve({ file: roblox.CLIENT_SETTINGS_FILE, written: enabledMap });
  } catch (e) {
    return Promise.resolve({ error: String(e && e.message ? e.message : e) });
  }
}

function backupDir() {
  return path.join(roblox.CLIENT_SETTINGS_DIR, 'RendrBackups');
}

function backup() {
  try {
    if (!fs.existsSync(roblox.CLIENT_SETTINGS_FILE)) {
      return Promise.resolve({ error: 'No ClientAppSettings.json exists yet — nothing to back up.' });
    }
    const dir = backupDir();
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(dir, `ClientAppSettings-${stamp}.json`);
    fs.copyFileSync(roblox.CLIENT_SETTINGS_FILE, dest);
    return Promise.resolve({ file: dest });
  } catch (e) {
    return Promise.resolve({ error: String(e && e.message ? e.message : e) });
  }
}

function listBackups() {
  // New backups go to RendrBackups; keep showing the old KillBoxBackups too.
  const dirs = [backupDir(), path.join(roblox.CLIENT_SETTINGS_DIR, 'KillBoxBackups')];
  const out = [];
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith('.json')) out.push(path.join(dir, f));
      }
    } catch { /* ignore */ }
  }
  return out.sort().reverse();
}

function restore(backupPath) {
  try {
    if (!backupPath || !fs.existsSync(backupPath)) {
      return Promise.resolve({ error: 'Backup file not found.' });
    }
    // Validate before overwriting the live file.
    const text = fs.readFileSync(backupPath, 'utf8').replace(/^\uFEFF/, '');
    roblox.writeClientSettings(JSON.parse(text));
    return Promise.resolve({ file: roblox.CLIENT_SETTINGS_FILE });
  } catch (e) {
    return Promise.resolve({ error: 'Not a valid ClientAppSettings.json backup: ' + (e && e.message ? e.message : e) });
  }
}

function clearAll(customFlags) {
  try {
    let existing = roblox.readClientSettings();
    if (existing && existing.__error) existing = {};
    for (const key of managedKeys(customFlags)) delete existing[key];
    roblox.writeClientSettings(existing);
    return Promise.resolve({ file: roblox.CLIENT_SETTINGS_FILE });
  } catch (e) {
    return Promise.resolve({ error: String(e && e.message ? e.message : e) });
  }
}

function getState(customFlags) {
  const current = roblox.readClientSettings();
  return {
    settingsPath: roblox.CLIENT_SETTINGS_FILE,
    settingsDir: roblox.CLIENT_SETTINGS_DIR,
    exists: fs.existsSync(roblox.CLIENT_SETTINGS_FILE),
    current: current && current.__error ? {} : current,
    playerExe: roblox.findPlayerExe(),
    studioExe: roblox.findStudioExe(),
    backups: listBackups(),
    managedKeys: managedKeys(customFlags)
  };
}

module.exports = {
  getLibrary,
  managedKeys,
  coerceValue,
  apply,
  backup,
  restore,
  clearAll,
  getState,
  listBackups
};
