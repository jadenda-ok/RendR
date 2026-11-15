// Rendr release notes, shown on the Overview and Update Log pages.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RENDR_CHANGELOG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  return [
    {
      version: '1.1.0',
      date: '2026-11-15',
      latest: true,
      notes: [
        'Complete redesign — Roblox-style navigation with an Overview dashboard, Update Log and About page.',
        'New black & white theme built around the geometric Rendr mark.',
        'FPS indicator rebuilt: stable smoothed readings, one capture session at a time, and a proper wait for the Windows permission prompt.',
        'FastFlags now reads Bloxstrap-style files with string values like "True" or "60", and backups are validated before restoring.',
        'Fixed the overlay appearing empty at launch, and temporary previews now revert to your crosshair automatically.',
        'The cycle-crosshair hotkey now always advances from your active crosshair.',
        'Presets can be used again and again without creating duplicate profiles.',
        'Removed the Roblox sign-in system — Rendr is fully local. No account, no cloud, nothing leaves your PC.'
      ]
    }
  ];
});
