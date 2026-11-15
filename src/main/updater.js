// Auto-updater: electron-updater for the installed build, GitHub releases API
// for the portable build (portable builds can't self-replace via NSIS).
const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const https = require('https');

let winGetter = null;
let feedStore = null;
let portable = false;
let last = { state: 'idle', version: null, percent: null, message: null };
let reportErrors = false; // only surface errors for user-initiated checks
let started = false;

function repoInfo() {
  try {
    const pkg = require('../../package.json');
    let r = pkg.repository;
    if (typeof r === 'string') r = { url: r };
    const url = (r && r.url) || '';
    const m = url.match(/github\.com[:\/]([^/]+)\/([^/.#]+)/i);
    if (m) return { owner: m[1], repo: m[2] };
  } catch { /* ignore */ }
  return { owner: '', repo: '' };
}

function send(payload) {
  last = { ...last, ...payload };
  if (!winGetter) return;
  const w = winGetter();
  if (w && !w.isDestroyed()) w.webContents.send('update:status', last);
}

function friendlyError(err) {
  const m = String((err && err.message) || err || '');
  if (/latest\.yml|404|not found/i.test(m)) return 'No update is published yet on the update server.';
  if (/ENOENT|app-update\.yml/i.test(m)) return 'This build has no update feed configured.';
  if (/certificate|ECONN|ETIMEDOUT|ENOTFOUND|network/i.test(m)) return 'Could not reach the update server — check your internet connection.';
  return m;
}

function releasesUrl() {
  const { owner, repo } = repoInfo();
  return owner && repo ? `https://github.com/${owner}/${repo}/releases/latest` : null;
}

// Runtime feed override from Settings. When neither is set, the feed baked
// into the build (app-update.yml from package.json "publish") is used.
function configure(feed = {}) {
  const baked = repoInfo();
  const owner = (feed && feed.feedOwner) || baked.owner;
  const repo = (feed && feed.feedRepo) || baked.repo;
  const url = feed && feed.feedUrl;
  if (owner && repo) {
    autoUpdater.setFeedURL({ provider: 'github', owner, repo });
    return true;
  }
  if (url) {
    autoUpdater.setFeedURL({ provider: 'generic', url });
    return true;
  }
  return false;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'rendr-updater', Accept: 'application/vnd.github+json' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  });
}

// Portable builds: no latest.yml exists in the package and the NSIS updater
// can't replace a portable exe. Compare versions via the GitHub releases API
// and point the user at the download page.
async function portableCheck() {
  const { owner, repo } = repoInfo();
  if (!owner || !repo) {
    return { status: 'portable', version: app.getVersion(), message: 'No update source is configured for this portable build.' };
  }
  try {
    const rel = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);
    const tag = String(rel.tag_name || '').replace(/^v/i, '');
    const current = app.getVersion();
    if (tag && tag !== current) {
      return { status: 'available', version: tag, url: rel.html_url, portable: true };
    }
    return { status: 'latest', version: current };
  } catch (e) {
    return { status: 'error', message: friendlyError(e) };
  }
}

async function check(silent = false) {
  if (!app.isPackaged) return { status: 'dev', version: app.getVersion() };
  reportErrors = !silent;
  try {
    if (feedStore) configure(feedStore.get('updates') || {});
    if (portable) {
      const r = await portableCheck();
      if (!silent) send({ state: r.status === 'latest' ? 'none' : r.status, version: r.version, message: r.message });
      return r;
    }
    const result = await autoUpdater.checkForUpdates();
    if (!result) return { status: 'latest', version: app.getVersion() };
    if (result.isUpdateAvailable) return { status: 'available', version: result.updateInfo.version };
    return { status: 'latest', version: app.getVersion() };
  } catch (e) {
    if (!silent) send({ state: 'error', message: friendlyError(e) });
    return { status: 'error', message: friendlyError(e) };
  } finally {
    reportErrors = false;
  }
}

function install() {
  if (!app.isPackaged) return { status: 'dev' };
  if (portable) {
    const url = releasesUrl();
    if (url) {
      const { shell } = require('electron');
      shell.openExternal(url);
    }
    return { status: 'portable', url };
  }
  try {
    autoUpdater.quitAndInstall(true, true);
    return { status: 'installing' };
  } catch (e) {
    return { status: 'error', message: friendlyError(e) };
  }
}

function status() {
  return last;
}

function start(getWin, store) {
  if (started) return;
  started = true;
  winGetter = getWin;
  feedStore = store;
  portable = !!process.env.PORTABLE_EXECUTABLE_FILE;
  autoUpdater.autoDownload = !portable;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => send({ state: 'available', version: info && info.version }));
  autoUpdater.on('update-not-available', () => send({ state: 'none', version: app.getVersion() }));
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => send({ state: 'downloaded', version: info && info.version }));
  autoUpdater.on('error', (err) => {
    // Background checks failing (offline, no releases yet) must stay quiet.
    if (reportErrors || last.state === 'downloading') send({ state: 'error', message: friendlyError(err) });
  });

  if (app.isPackaged) {
    configure(store.get('updates') || {});
    if (!portable) {
      // First check shortly after launch, then every 6 hours.
      setTimeout(() => check(true), 8000);
      setInterval(() => check(true), 6 * 60 * 60 * 1000);
    }
  }
}

module.exports = { start, configure, check, install, status, releasesUrl };
