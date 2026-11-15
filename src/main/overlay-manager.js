const { BrowserWindow, screen } = require('electron');
const path = require('path');

// Manages the transparent, click-through, always-on-top overlay window.
class OverlayManager {
  constructor(store) {
    this.store = store;
    this.win = null;
    this.profile = null;
    this.previewProfile = null;
    this.visibility = true;
    this.previewUntil = 0;
    this.previewTimer = null;
    this.cursorTimer = null;
    this.robloxTimer = null;
    this.currentDisplayId = null;
  }

  create() {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    this.currentDisplayId = display.id;
    this.win = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      enableLargerThanScreen: true,
      fullscreenable: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    });
    this.win.setAlwaysOnTop(true, 'screen-saver');
    this.win.setIgnoreMouseEvents(true, { forward: true });
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.win.loadFile(path.join(__dirname, '..', 'overlay', 'overlay.html'));
    // Sending before the page finished loading gets dropped — the listeners
    // don't exist yet. Re-send once the page is up.
    this.win.webContents.on('did-finish-load', () => {
      this.sendProfile();
      this.sendVisibility();
    });
    this.win.on('closed', () => {
      this.win = null;
    });
    return this.win;
  }

  send(channel, payload) {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(channel, payload);
    }
  }

  setProfile(profile) {
    this.profile = profile;
    this.sendProfile();
  }

  sendProfile() {
    this.send('overlay:profile', this.previewProfile || this.profile);
  }

  computeVisibility() {
    const settings = this.store.get('overlay');
    let show = settings.enabled;
    if (this.previewUntil > Date.now()) show = true;
    else if (settings.onlyWhenRobloxRunning && !this._robloxRunning) show = false;
    return show;
  }

  setRobloxRunning(running) {
    this._robloxRunning = running;
    this.sendVisibility();
  }

  setVisibility(enabled) {
    this.store.patch('overlay', { enabled: !!enabled });
    this.sendVisibility();
  }

  sendVisibility() {
    const show = this.computeVisibility();
    this.visibility = show;
    this.send('overlay:visibility', {
      show,
      masterOpacity: this.store.get('overlay').masterOpacity
    });
  }

  // Show a profile temporarily without touching the active one, then revert.
  previewForSeconds(profile, seconds = 5) {
    this.previewUntil = Date.now() + seconds * 1000;
    this.previewProfile = profile || null;
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => {
      this.previewProfile = null;
      this.previewTimer = null;
      this.previewUntil = 0;
      this.sendProfile();
      this.sendVisibility();
    }, seconds * 1000);
    this.sendProfile();
    this.sendVisibility();
  }

  // Move the overlay to whichever display the cursor is on.
  followCursor() {
    const settings = this.store.get('overlay');
    if (!settings.followCursorMonitor) return;
    if (!this.win || this.win.isDestroyed()) return;
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    const bounds = display.bounds;
    const cur = this.win.getBounds();
    const same = display.id === this.currentDisplayId
      && cur.x === bounds.x && cur.y === bounds.y
      && cur.width === bounds.width && cur.height === bounds.height;
    if (!same) {
      this.currentDisplayId = display.id;
      this.win.setBounds(bounds);
    }
  }

  startWatchers() {
    if (this.cursorTimer) clearInterval(this.cursorTimer);
    this.cursorTimer = setInterval(() => this.followCursor(), 750);

    // Monitor changes (plug/unplug, resolution/scale changes) can desync the
    // overlay from the display under the cursor — refit when they happen.
    const onMetrics = () => {
      this.currentDisplayId = null;
      this.followCursor();
    };
    screen.on('display-metrics-changed', onMetrics);
    screen.on('display-added', onMetrics);
    screen.on('display-removed', onMetrics);

    if (this.robloxTimer) clearInterval(this.robloxTimer);
    const roblox = require('./roblox');
    const check = () => {
      const settings = this.store.get('overlay');
      if (!settings.onlyWhenRobloxRunning) {
        if (this._robloxRunning !== true) {
          this.setRobloxRunning(true);
        }
        return;
      }
      roblox.isRobloxRunning().then((running) => {
        if (running !== this._robloxRunning) this.setRobloxRunning(running);
      });
    };
    check();
    this.robloxTimer = setInterval(check, 3000);
  }

  destroy() {
    if (this.cursorTimer) clearInterval(this.cursorTimer);
    if (this.robloxTimer) clearInterval(this.robloxTimer);
    if (this.previewTimer) clearTimeout(this.previewTimer);
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }
}

module.exports = { OverlayManager };
