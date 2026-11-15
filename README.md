# rendr

Website: https://jadenda-ok.github.io/RendR/ · Downloads: https://github.com/jadenda-ok/RendR/releases

A crosshair overlay studio + FastFlags manager for Roblox. Design unlimited custom
crosshairs (cross, dot, ring, T, box, custom images — with outlines, glow, rainbow and
pulse/rotate animations), render them as a click-through overlay on top of Roblox, and
manage Roblox client FastFlags through the official `ClientAppSettings.json` mechanism.
No injection — the overlay is a separate always-on-top window and flags are written with
Roblox's own supported settings file. Everything runs locally; there are no accounts and
your data never leaves this PC.

## Features

- **Click-through overlay** — never blocks your mouse or keyboard, sits above Roblox
- **Crosshair Studio** — layer-based editor with live preview on a fake game scene
- **6 layer types** — cross, dot, ring, T-sight, box, custom image (PNG/JPG/WEBP/GIF/SVG)
- **Per-layer styling** — color, outline, glow, rainbow mode, round caps, opacity
- **Animations** — pulse (breathing) and rotate, with adjustable speed
- **Profiles** — create/duplicate/rename/delete, JSON import/export, PNG export
- **Built-in presets** — 12 presets, one click to use
- **Hotkeys** — global toggle + profile cycle, fully rebindable
- **Multi-monitor** — overlay follows your cursor to the active display
- **Roblox-aware** — optionally auto-hides when Roblox Player isn't running
- **FPS indicator** — shows your real in-game FPS in the corner of the overlay,
  captured with Intel PresentMon (ETW-based, no injection, no game-memory access —
  safe with Roblox anti-cheat). First enable per session asks for admin approval.
- **FastFlags manager** — curated flag library with search + categories, custom flags
  (one-by-one **or bulk-imported from .json / .txt files**), apply/backup/restore/clear,
  import/export, launch Roblox
- **Tray control** — minimize/close to tray, toggle overlay from the tray menu
- **Auto-updater** — in-app updates from any web host or GitHub releases (electron-updater)

## Running from source

```bash
npm install
npm start          # run the app
npm run smoke      # headless-ish sanity check (auto-exits)
```

## Building the release

```bash
npm run dist            # both targets
npm run dist:installer  # NSIS installer only
npm run dist:portable   # portable only
```

This produces, in the `release/` folder:

- `rendr-setup.exe` — the NSIS **installer** (this is the downloader you
  distribute to users)
- `Rendr-Portable-1.1.0.exe` — a portable no-install build
- `latest.yml` — the update metadata file (generated from the publish feed in
  `package.json`)

## Releasing + enabling auto-updates

The updater is wired to GitHub Releases on
[`jadenda-ok/RendR`](https://github.com/jadenda-ok/RendR) (see `"publish"` in
`package.json`). The repo **must stay public** for auto-update to work.

### Automatic (recommended) — tag a version

1. Bump `"version"` in `package.json` (e.g. `1.2.0`), commit, push.
2. Tag the commit and push the tag:

   ```bash
   git tag v1.2.0
   git push origin v1.2.0
   ```

3. The GitHub Actions workflow (`.github/workflows/release.yml`) builds the
   installer + portable build and publishes them as a GitHub Release with
   `latest.yml` automatically.
4. Done — installed copies find the new version on their next check
   (8 s after launch, then every 6 h).

### Manual fallback

1. Run `npm run dist` locally.
2. Create a GitHub Release tagged `v1.1.0` and upload `rendr-setup.exe`,
   `latest.yml` and the `.blockmap` file from `release/`.
3. Users can also paste `jadenda-ok/RendR` into Settings → Updates to override
   the feed on their machine.

In the app, Settings → Updates shows the check status, download progress and an
**Install & Restart** button once an update is downloaded.

## Notes & limitations

- **Exclusive fullscreen**: Windows cannot draw any overlay over a true exclusive
  fullscreen app. Roblox Player runs borderless/windowed, so the overlay works fine.
- FastFlags are internal client toggles; some may be ignored by newer Roblox versions.
  If anything breaks, use **Restore** or **Clear Managed** in the FastFlags tab.
- The FPS indicator needs one Windows admin approval per Roblox session (PresentMon
  restarts itself elevated to read ETW frame data). Toggle the FPS indicator off and
  on to retry if the prompt was missed.
- Unofficial tool, not affiliated with Roblox Corporation.

## Troubleshooting

- **Build fails with "EBUSY / resource busy" on `default_app.asar`**: your editor's
  file watcher (or antivirus) is holding freshly-extracted build files. Build with
  the output outside the watched folder:
  `npx electron-builder --win -c.directories.output="%TEMP%\rendr-release"`, or close
  the editor/AV while building.
- **App doesn't start at all (silently quits)**: another instance of the app (or an
  older version sharing the same `%APPDATA%\Rendr` profile) is already
  running — close it first. A crashed instance can also leave a stale
  `%APPDATA%\Rendr\lockfile`; delete it while no Rendr processes run.
- **FPS indicator stuck on "Admin approval needed"**: toggle the FPS indicator off and
  on again in Settings → Overlay, then accept the UAC prompt within a minute.

## Tech

Electron + vanilla JS (no framework), `electron-builder` for packaging,
`electron-updater` for updates. Settings/profiles are stored as JSON in
`%APPDATA%/Rendr/data/`. On first launch after upgrading from Killbox, existing
profiles and settings are migrated automatically.

The FPS indicator bundles **Intel PresentMon 2.6.0** (MIT license) as an
`extraResource`; it captures frame-present timestamps via ETW, restarts itself
elevated once per session (UAC), and terminates itself when Roblox exits.
