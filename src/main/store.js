const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const BUILTIN_PRESETS = require('../shared/presets');

const DEFAULTS = {
  general: {
    startWithWindows: false,
    minimizeToTray: true,
    closeToTray: true
  },
  overlay: {
    enabled: true,
    toggleHotkey: 'Control+Alt+X',
    cycleHotkey: 'Control+Alt+C',
    followCursorMonitor: true,
    onlyWhenRobloxRunning: false,
    masterOpacity: 1,
    fpsIndicator: false
  },
  profiles: [],
  activeProfileId: null,
  fflags: {
    enabled: {},
    custom: []
  },
  updates: {
    feedUrl: '',
    feedOwner: '',
    feedRepo: ''
  }
};

const SAVE_DEBOUNCE_MS = 250;

class Store {
  constructor() {
    this.dir = path.join(app.getPath('userData'), 'data');
    this.file = path.join(this.dir, 'rendr.json');
    this.data = this.load();
    this._timer = null;
  }

  // One-time migration from the old Killbox identity (same data dir or the
  // legacy %APPDATA%\Killbox folder).
  _migrateLegacyFile() {
    if (fs.existsSync(this.file)) return;
    const candidates = [
      path.join(this.dir, 'killbox.json'),
      path.join(app.getPath('appData'), 'Killbox', 'data', 'killbox.json')
    ];
    for (const old of candidates) {
      if (fs.existsSync(old)) {
        try {
          fs.mkdirSync(this.dir, { recursive: true });
          fs.copyFileSync(old, this.file);
          return;
        } catch (e) {
          console.error('legacy store migration failed', e);
        }
      }
    }
  }

  _read() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return deepMerge(structuredClone(DEFAULTS), raw);
    } catch (e) {
      // Don't silently wipe data the user can't see: park the corrupt file
      // and start from defaults.
      if (fs.existsSync(this.file)) {
        try { fs.renameSync(this.file, this.file + '.corrupt-' + Date.now()); } catch { /* ignore */ }
      }
      return structuredClone(DEFAULTS);
    }
  }

  load() {
    this._migrateLegacyFile();
    return this._read();
  }

  // Debounced: renderer slider drags save entire profiles (possibly with
  // embedded images) several times per second; write at most ~4x/s.
  save() {
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this._flush();
    }, SAVE_DEBOUNCE_MS);
  }

  _flush() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (e) {
      console.error('store save failed', e);
    }
  }

  flushSync() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._flush();
  }

  get(key) {
    return key ? this.data[key] : this.data;
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
  }

  patch(key, partial) {
    this.data[key] = { ...this.data[key], ...partial };
    this.save();
  }

  seedPresets() {
    if (!this.data.profiles || this.data.profiles.length === 0) {
      this.data.profiles = structuredClone(BUILTIN_PRESETS).map((p) => ({
        ...p,
        builtin: false,
        createdAt: Date.now()
      }));
      this.data.activeProfileId = this.data.profiles[0].id;
      this.save();
    }
    if (!this.data.activeProfileId && this.data.profiles.length) {
      this.data.activeProfileId = this.data.profiles[0].id;
      this.save();
    }
  }
}

function deepMerge(base, extra) {
  const out = { ...base };
  for (const k of Object.keys(extra || {})) {
    const b = base[k];
    const e = extra[k];
    if (b && typeof b === 'object' && !Array.isArray(b) && e && typeof e === 'object' && !Array.isArray(e)) {
      out[k] = deepMerge(b, e);
    } else {
      out[k] = e;
    }
  }
  return out;
}

module.exports = { Store, DEFAULTS };
