const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const os = require('os');

const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const ROBLOX_DIR = path.join(LOCALAPPDATA, 'Roblox');
const VERSIONS_DIR = path.join(ROBLOX_DIR, 'Versions');
const CLIENT_SETTINGS_DIR = path.join(ROBLOX_DIR, 'ClientSettings');
const CLIENT_SETTINGS_FILE = path.join(CLIENT_SETTINGS_DIR, 'ClientAppSettings.json');

function findPlayerExe() {
  try {
    if (!fs.existsSync(VERSIONS_DIR)) return null;
    const versions = fs
      .readdirSync(VERSIONS_DIR)
      .filter((d) => d.startsWith('version-'))
      .map((d) => {
        const exe = path.join(VERSIONS_DIR, d, 'RobloxPlayerBeta.exe');
        try {
          return { dir: d, exe, mtime: fs.statSync(exe).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);
    return versions[0] ? versions[0].exe : null;
  } catch {
    return null;
  }
}

function findStudioExe() {
  try {
    if (!fs.existsSync(VERSIONS_DIR)) return null;
    const versions = fs
      .readdirSync(VERSIONS_DIR)
      .filter((d) => d.startsWith('version-'))
      .map((d) => {
        const exe = path.join(VERSIONS_DIR, d, 'RobloxStudioBeta.exe');
        try {
          return { dir: d, exe, mtime: fs.statSync(exe).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);
    return versions[0] ? versions[0].exe : null;
  } catch {
    return null;
  }
}

function readClientSettings() {
  try {
    if (!fs.existsSync(CLIENT_SETTINGS_FILE)) return {};
    // Bloxstrap-style writers sometimes leave a BOM, which breaks JSON.parse.
    return JSON.parse(fs.readFileSync(CLIENT_SETTINGS_FILE, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    return { __error: String(e && e.message ? e.message : e) };
  }
}

function writeClientSettings(obj) {
  fs.mkdirSync(CLIENT_SETTINGS_DIR, { recursive: true });
  fs.writeFileSync(CLIENT_SETTINGS_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

function isRobloxRunning() {
  return getPlayerPids().then((pids) => pids.length > 0);
}

function getPlayerPids() {
  return new Promise((resolve) => {
    exec(
      'tasklist /FI "IMAGENAME eq RobloxPlayerBeta.exe" /FO CSV /NH',
      { windowsHide: true, timeout: 4000 },
      (err, stdout) => {
        if (err) return resolve([]);
        const pids = [];
        for (const line of (stdout || '').split(/\r?\n/)) {
          const m = line.match(/"RobloxPlayerBeta\.exe","(\d+)"/i);
          if (m) pids.push(parseInt(m[1], 10));
        }
        resolve(pids);
      }
    );
  });
}

function launchRoblox() {
  return new Promise((resolve, reject) => {
    const exe = findPlayerExe();
    if (exe) {
      try {
        const child = spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: false });
        child.unref();
        return resolve({ method: 'exe', path: exe });
      } catch (e) {
        return reject(e);
      }
    }
    exec('start "" roblox://', { windowsHide: true }, (err) => {
      if (err) return reject(err);
      resolve({ method: 'protocol' });
    });
  });
}

module.exports = {
  ROBLOX_DIR,
  VERSIONS_DIR,
  CLIENT_SETTINGS_DIR,
  CLIENT_SETTINGS_FILE,
  findPlayerExe,
  findStudioExe,
  readClientSettings,
  writeClientSettings,
  isRobloxRunning,
  getPlayerPids,
  launchRoblox
};
