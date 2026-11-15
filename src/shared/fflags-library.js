// Curated library of community-documented Roblox FastFlags (ClientAppSettings.json).
// These are client-side developer/QA toggles that Roblox ships with its client.
// Some flags may be ignored by newer client versions. Users can also add custom flags.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FFLAGS_LIBRARY = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const B = (name, category, description) => ({ name, type: 'bool', category, description, default: false });
  const I = (name, category, description, min, max, def) => ({ name, type: 'int', category, description, min, max, default: def });
  const F = (name, category, description, min, max, def) => ({ name, type: 'float', category, description, min, max, default: def });
  const S = (name, category, description, def) => ({ name, type: 'string', category, description, default: def });
  const E = (name, category, description, options, def) => ({ name, type: 'enum', category, description, options, default: def });

  return [
    // ---------- Performance / FPS ----------
    I('DFIntTaskSchedulerTargetFps', 'Performance', 'Overrides the task scheduler target FPS. Use your monitor refresh rate (60/120/144/165/240/360) or 0 for uncapped.', 0, 1000, 0),
    I('DFIntMaxTaskSchedulerThreadCount', 'Performance', 'Limits the number of task scheduler threads used by the client.', 1, 64, 0),
    B('FFlagGameBasicSettingsFramerateCap', 'Performance', 'Shows the framerate cap option in Roblox settings.', false),
    B('FFlagEnableQuickGameLaunch', 'Performance', 'Skips the "launching experience" loading splash when joining a game.', false),

    // ---------- Graphics / Rendering ----------
    B('FFlagDebugGraphicsPreferD3D11', 'Graphics', 'Forces the Direct3D 11 renderer.', false),
    B('FFlagDebugGraphicsPreferD3D11FL10', 'Graphics', 'Forces Direct3D 11 with Feature Level 10 (better compatibility on old GPUs).', false),
    B('FFlagDebugGraphicsPreferVulkan', 'Graphics', 'Forces the Vulkan renderer (best on AMD/Linux-style drivers).', false),
    B('FFlagDebugGraphicsPreferOpenGL', 'Graphics', 'Forces the OpenGL renderer.', false),
    B('FFlagDebugGraphicsDisableDirect3D11', 'Graphics', 'Disables Direct3D 11 (client falls back to another renderer).', false),
    B('FFlagDebugGraphicsDisableVulkan', 'Graphics', 'Disables Vulkan (client falls back to another renderer).', false),
    B('FFlagDisablePostFx', 'Graphics', 'Disables post-processing effects (bloom, color grading, etc). Can improve FPS.', false),
    I('DFIntDebugFRMQualityLevelOverride', 'Graphics', 'Overrides the MSAA quality level (1 = 2x, 2 = 4x, 3 = 8x). 0 = driver default.', 0, 4, 0),
    B('FFlagDebugForceFutureLighting', 'Graphics', 'Forces the "Future" lighting technology mode.', false),
    I('DFIntDebugRenderForceTechnologyVoxel', 'Graphics', 'Forces voxel lighting. 0 disables it (classic lighting), 1 enables it.', 0, 1, 0),
    I('FIntFRMMaxGrassDistance', 'Graphics', 'Maximum grass render distance in studs.', 0, 500, 0),
    I('FIntFRMMinGrassDistance', 'Graphics', 'Minimum grass render distance in studs.', 0, 500, 0),
    I('DFIntTextureCompositorActiveJobs', 'Graphics', 'Number of GPU texture compositor jobs. Higher values load textures faster but use more resources (8 = max).', 0, 8, 0),
    I('FIntDebugTextureManagerSkipMips', 'Graphics', 'Skips mipmap levels to lower texture quality (0 = full quality).', 0, 8, 0),
    B('FFlagRenderEnableGlobalWind', 'Graphics', 'Enables the global wind effect on grass and particles.', false),

    // ---------- UI ----------
    I('FIntRobloxGuiBlurIntensity', 'UI', 'UI blur intensity (0 disables UI blur entirely, max 10).', 0, 10, 0),
    B('FFlagEnableInGameMenuChrome', 'UI', 'Enables the chrome-styled in-game menu.', false),
    B('FFlagEnableInGameMenuChromeABTest4', 'UI', 'Enables the chrome in-game menu AB test variant 4.', false),
    B('FFlagEnableInGameMenuV3', 'UI', 'Enables the V3 in-game menu.', false),
    B('FFlagEnableV3MenuABTest3', 'UI', 'Enables the V3 in-game menu AB test variant 3.', false),
    B('FFlagDisableNewIGMDUvWrap', 'UI', 'Uses legacy icon UV mapping in the in-game menu (fixes stretched icons on some UIs).', false),
    B('FFlagHandleAltEnterFullscreenManually', 'UI', 'Fixes the Alt+Enter fullscreen toggle behavior.', false),

    // ---------- Network ----------
    I('DFIntConnectionMTUSize', 'Network', 'Sets the network MTU size. Lower values (e.g. 750) can help on unstable connections.', 750, 1500, 0),
    I('DFIntS2PhysicsSenderRate', 'Network', 'Physics sender rate per second. Lower (e.g. 20) reduces bandwidth usage at the cost of smoothness.', 10, 120, 0),

    // ---------- Privacy / Telemetry ----------
    B('FFlagDebugDisableTelemetry', 'Privacy', 'Disables Roblox telemetry reporting.', false),
    B('FFlagDebugDisableTelemetryV2', 'Privacy', 'Disables the V2 telemetry pipeline.', false),
    B('FFlagDebugDisableTelemetryEphemeralCounter', 'Privacy', 'Disables ephemeral counter telemetry.', false),
    B('FFlagDebugDisableTelemetryEphemeralStat', 'Privacy', 'Disables ephemeral stat telemetry.', false),
    B('FFlagDebugDisableTelemetryEventIngest', 'Privacy', 'Disables telemetry event ingestion.', false),
    B('FFlagAdServiceEnabled', 'Privacy', 'Set to False to disable in-app ads shown by the client.', false),

    // ---------- Audio ----------
    I('FIntSoundMaxRenderDistance', 'Audio', 'Maximum distance (studs) at which sounds are rendered.', 0, 10000, 0),

    // ---------- Misc ----------
    B('FFlagDebugDisableDPIScale', 'Misc', 'Disables DPI scaling in the client (can fix blurry UI on high-DPI screens).', false),
    S('FStringUnlockClientReleaseChannel', 'Misc', 'Sets the client release channel (e.g. LIVE, ZNext, ZCanary).', '')
  ];
});
