// Roblox FPS monitor — captures Roblox Player's frame presents via Intel
// PresentMon (ETW, no injection, no game-memory access) and derives a smoothed
// FPS value from the CSV it writes. PresentMon restarts itself elevated (UAC).
//
// Lifecycle: enabled -> wait for Roblox -> spawn PresentMon (UAC prompt) ->
// parse v1-metrics CSV rows -> smoothed FPS. PresentMon exits by itself when
// Roblox quits (--terminate_on_proc_exit), so one UAC approval is needed per
// Roblox session.
const { app } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const TICK_MS = 500;
const ROBLOX_CHECK_MS = 2000;
const UAC_GRACE_MS = 60000; // first rows may wait on a slow UAC approval
const STALE_MS = 8000; // quiet stream: fade fps but keep the session alive
const STALL_MS = 30000; // stream dead while Roblox runs: give up until re-enable
const SESSION_NAME = 'RendrFPS'; // private ETW session, won't fight other PresentMon users
const EMA = 0.25; // smoothing: fps = old*0.75 + raw*0.25

class FpsMonitor {
  constructor(store) {
    this.store = store;
    this.onStatus = null; // ({state, fps, message}) => void
    this.enabled = false;
    this.state = 'off';
    this.fps = null;
    this.message = null;
    this.child = null;
    this.csvPath = null;
    this.readOffset = 0;
    this.msCol = -1;
    this.timeCol = -1;
    this.window = []; // [{t, ms}] within a rolling ~1.2s
    this.partial = ''; // trailing chunk fragment of an unfinished CSV line
    this.lastRows = 0;
    this.lastRowWall = 0; // Date.now() when rows were last parsed
    this.startedAt = 0;
    this.robloxCheckAt = 0;
    this.robloxRunning = false;
    this.denied = false;
    this.timer = null;
    this._busy = false;
  }

  exePath() {
    if (app.isPackaged) return path.join(process.resourcesPath, 'presentmon', 'PresentMon.exe');
    return path.join(__dirname, '..', '..', 'vendor', 'presentmon', 'PresentMon.exe');
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (!on) {
      this._cleanupSession();
      this._setState('off', null, null);
    } else {
      // An explicit re-enable is the retry path after a denied UAC prompt.
      this.denied = false;
      this._setState('waiting', null, 'Waiting for Roblox to start…');
    }
    this._ensureTimer();
  }

  _ensureTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => { this._tick(); }, TICK_MS);
  }

  _setState(state, fps = this.fps, message = null) {
    this.state = state;
    this.fps = fps;
    this.message = message;
    if (this.onStatus) this.onStatus({ state, fps, message });
  }

  // Drop any child we own and reset session state. A running elevated
  // PresentMon is not ours to kill (non-elevated taskkill gets access-denied)
  // — it self-terminates when Roblox exits (--terminate_on_proc_exit).
  _cleanupSession() {
    if (this.child) {
      try { this.child.kill(); } catch { /* already gone */ }
      this.child = null;
    }
    this.csvPath = null;
    this.readOffset = 0;
    this.msCol = -1;
    this.timeCol = -1;
    this.window = [];
    this.partial = '';
    this.lastRows = 0;
    this.lastRowWall = 0;
    this.startedAt = 0;
  }

  async _tick() {
    // The Roblox PID lookup can take seconds; never let ticks overlap, or we
    // would spawn PresentMon twice and the second --stop_existing_session
    // would kill the first session (two UAC prompts, no data).
    if (this._busy || !this.enabled) return;
    this._busy = true;
    try {
      await this._tickInner();
    } catch (e) {
      this._setState('error', null, String(e && e.message ? e.message : e));
    } finally {
      this._busy = false;
    }
  }

  async _tickInner() {
    const exe = this.exePath();
    if (!fs.existsSync(exe)) {
      this._setState('error', null, 'PresentMon is missing from the app files.');
      return;
    }

    const now = Date.now();
    if (now - this.robloxCheckAt > ROBLOX_CHECK_MS) {
      this.robloxCheckAt = now;
      const roblox = require('./roblox');
      this.robloxRunning = (await roblox.getPlayerPids()).length > 0;
      if (!this.enabled) return;
    }

    if (!this.robloxRunning) {
      if (this.csvPath) this._cleanupSession();
      this._setState('waiting', null, 'Waiting for Roblox to start…');
      return;
    }

    if (!this.csvPath) {
      if (this.denied) return; // wait for the user to re-enable, don't spam UAC
      this._startCapture(exe);
      return;
    }

    const rows = this._readRows();
    if (rows > 0) {
      this.lastRows += rows;
      this.lastRowWall = now;
      this._setState('running', this.fps);
      return;
    }

    // No new rows this tick.
    if (this.lastRows === 0) {
      // Waiting for the elevated instance to start writing. UAC approval can
      // take a while, so only give up after a generous grace period.
      if (now - this.startedAt > UAC_GRACE_MS) {
        this.denied = true;
        this._cleanupSession();
        this._setState('denied', null,
          'No data from PresentMon. Toggle the FPS indicator off and on, then accept the Windows admin prompt.');
      } else if (this.state !== 'starting') {
        this._setState('starting', null, 'Waiting for Windows permission (UAC)…');
      }
      return;
    }

    if (now - this.lastRowWall > STALL_MS) {
      // The stream is dead while Roblox still runs (PresentMon crashed or was
      // killed). Restarting would trigger another UAC prompt, so stop here and
      // let the user decide.
      this.denied = true;
      this._cleanupSession();
      this._setState('error', null, 'The FPS capture stopped unexpectedly. Toggle the FPS indicator off and on to restart it.');
      return;
    }

    if (now - this.lastRowWall > STALE_MS && this.fps != null) {
      // Quiet but likely still alive (loading screen, minimized game). Keep
      // the session, just fade the number out until rows resume.
      this._setState('running', null, 'No recent frames — is the game minimized or loading?');
    }
  }

  _startCapture(exe) {
    const dir = path.join(app.getPath('userData'), 'data');
    try {
      fs.mkdirSync(dir, { recursive: true });
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith('presentmon-') && f.endsWith('.csv')) {
          try { fs.unlinkSync(path.join(dir, f)); } catch { /* locked by a live session */ }
        }
      }
    } catch { /* ignore */ }

    this.csvPath = path.join(dir, `presentmon-${Date.now()}.csv`);
    this.readOffset = 0;
    this.lastRows = 0;
    this.lastRowWall = 0;
    this.window = [];
    this.partial = '';
    this.startedAt = Date.now();
    this._setState('starting', null, 'Waiting for Windows permission (UAC)…');

    const args = [
      '--session_name', SESSION_NAME,
      '--process_name', 'RobloxPlayerBeta.exe',
      '--output_file', this.csvPath,
      '--v1_metrics',
      '--no_console_stats',
      '--exclude_dropped',
      '--terminate_on_proc_exit',
      '--stop_existing_session',
      '--restart_as_admin'
    ];
    try {
      this.child = spawn(exe, args, { windowsHide: true, stdio: 'ignore' });
      this.child.on('exit', () => { this.child = null; });
      this.child.on('error', (e) => {
        this.child = null;
        this._cleanupSession();
        this._setState('error', null, String(e && e.message ? e.message : e));
      });
    } catch (e) {
      this._cleanupSession();
      this._setState('error', null, String(e && e.message ? e.message : e));
    }
  }

  _readRows() {
    let fd = -1;
    let rows = 0;
    try {
      fd = fs.openSync(this.csvPath, 'r');
      const size = fs.fstatSync(fd).size;
      if (size <= this.readOffset) return 0;
      const buf = Buffer.alloc(Math.min(size - this.readOffset, 1024 * 1024));
      const n = fs.readSync(fd, buf, 0, buf.length, this.readOffset);
      fs.closeSync(fd);
      fd = -1;
      this.readOffset += n;
      rows = this._parseChunk(buf.toString('utf8', 0, n));
    } catch {
      return 0;
    } finally {
      if (fd !== -1) { try { fs.closeSync(fd); } catch { /* ignore */ } }
    }
    return rows;
  }

  _parseChunk(text) {
    let rows = 0;
    this.partial += text;
    const lines = this.partial.split(/\r?\n/);
    this.partial = lines.pop(); // keep the trailing fragment for the next chunk
    if (this.partial.length > 65536) this.partial = '';

    for (const line of lines) {
      if (!line) continue;
      if (line.includes('msBetweenPresents') && line.includes('TimeInSeconds')) {
        const cols = line.split(',');
        this.msCol = cols.indexOf('msBetweenPresents');
        this.timeCol = cols.indexOf('TimeInSeconds');
        continue;
      }
      if (this.msCol < 0) continue;
      const cols = line.split(',');
      const ms = parseFloat(cols[this.msCol]);
      const t = parseFloat(cols[this.timeCol >= 0 ? this.timeCol : cols.length - 1]);
      if (!isFinite(ms) || !isFinite(t) || ms <= 0) continue;
      this.window.push({ t, ms });
      rows++;
    }
    const cutoff = this.window.length ? this.window[this.window.length - 1].t - 1.2 : 0;
    while (this.window.length && this.window[0].t < cutoff) this.window.shift();
    if (this.window.length >= 2) {
      const span = this.window[this.window.length - 1].t - this.window[0].t;
      if (span > 0.01) {
        const raw = this.window.length / span;
        this.fps = this.fps == null ? Math.round(raw) : Math.round(this.fps * (1 - EMA) + raw * EMA);
      }
    }
    return rows;
  }

  stop() {
    this.enabled = false;
    this._cleanupSession();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this._setState('off', null, null);
  }
}

module.exports = { FpsMonitor };
