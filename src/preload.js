const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // store
  getStore: () => ipcRenderer.invoke('store:get'),
  setStore: (key, value) => ipcRenderer.invoke('store:set', key, value),
  patchStore: (key, partial) => ipcRenderer.invoke('store:patch', key, partial),

  // app
  getInfo: () => ipcRenderer.invoke('app:info'),
  setStartWithWindows: (enable) => ipcRenderer.invoke('app:setStartWithWindows', enable),
  openDataFolder: () => ipcRenderer.invoke('app:openDataFolder'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  resetApp: () => ipcRenderer.invoke('app:reset'),

  // window controls
  winMinimize: () => ipcRenderer.send('win:minimize'),
  winClose: () => ipcRenderer.send('win:close'),
  winToggleMaximize: () => ipcRenderer.send('win:toggleMaximize'),

  // overlay
  overlayToggle: () => ipcRenderer.invoke('overlay:toggle'),
  overlaySetEnabled: (enabled) => ipcRenderer.invoke('overlay:setEnabled', enabled),
  overlayApplyProfile: (profile) => ipcRenderer.invoke('overlay:applyProfile', profile),
  overlayPreview: (profile, seconds) => ipcRenderer.invoke('overlay:preview', profile, seconds),
  overlaySetMasterOpacity: (value) => ipcRenderer.invoke('overlay:setMasterOpacity', value),
  hotkeysSet: (which, combo) => ipcRenderer.invoke('hotkeys:set', which, combo),

  // profiles
  profilesExport: (profile) => ipcRenderer.invoke('profiles:export', profile),
  profilesImport: () => ipcRenderer.invoke('profiles:import'),
  profilesExportImage: (dataUrl) => ipcRenderer.invoke('profiles:exportImage', dataUrl),
  pickImage: () => ipcRenderer.invoke('layer:pickImage'),

  // fflags
  fflagsGetState: () => ipcRenderer.invoke('fflags:getState'),
  fflagsApply: (enabled, customFlags, launch) => ipcRenderer.invoke('fflags:apply', enabled, customFlags, launch),
  fflagsBackup: () => ipcRenderer.invoke('fflags:backup'),
  fflagsRestore: (backupPath) => ipcRenderer.invoke('fflags:restore', backupPath),
  fflagsClear: () => ipcRenderer.invoke('fflags:clear'),
  fflagsOpenFolder: () => ipcRenderer.invoke('fflags:openFolder'),
  fflagsLaunchRoblox: () => ipcRenderer.invoke('fflags:launchRoblox'),
  fflagsImport: () => ipcRenderer.invoke('fflags:import'),
  fflagsExport: (flags) => ipcRenderer.invoke('fflags:export', flags),

  // roblox / fps
  robloxStatus: () => ipcRenderer.invoke('roblox:status'),
  fpsRetry: () => ipcRenderer.invoke('fps:retry'),

  // updates
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  updateStatus: () => ipcRenderer.invoke('update:status'),

  // events (main -> renderer)
  on: (channel, cb) => {
    const allowed = ['app:activeProfile', 'overlay:enabled', 'update:status', 'fps:status'];
    if (!allowed.includes(channel)) return () => {};
    const listener = (e, ...args) => cb(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});

// Overlay-only API (exposed in the overlay window too; the overlay only consumes events).
contextBridge.exposeInMainWorld('overlayApi', {
  on: (channel, cb) => {
    const allowed = ['overlay:profile', 'overlay:visibility', 'overlay:fps'];
    if (!allowed.includes(channel)) return () => {};
    const listener = (e, ...args) => cb(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
