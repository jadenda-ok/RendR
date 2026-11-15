// Built-in crosshair presets used to seed the profile list on first launch.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BUILTIN_PRESETS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  let n = 0;
  const L = (layer) => ({ id: 'l' + ++n, visible: true, ...layer });
  const base = {
    position: { x: 0.5, y: 0.5 },
    scale: 1,
    masterOpacity: 1
  };
  const cross = (o) => L({ type: 'cross', length: 14, thickness: 3, gap: 6, ...o });
  const dot = (o) => L({ type: 'dot', radius: 3, ...o });
  const circle = (o) => L({ type: 'circle', radius: 12, thickness: 2, segments: 0, ...o });
  const t = (o) => L({ type: 't', length: 12, thickness: 3, gap: 6, direction: 'up', ...o });
  const square = (o) => L({ type: 'square', size: 12, thickness: 2, ...o });

  return [
    {
      id: 'preset-classic',
      name: 'Classic Cross',
      description: 'The timeless green cross.',
      ...base,
      layers: [cross({ color: '#00ff5e', outline: 1, outlineColor: '#000000' })]
    },
    {
      id: 'preset-compact',
      name: 'Compact',
      description: 'Small and clean.',
      ...base,
      layers: [cross({ color: '#00ff5e', length: 8, thickness: 2, gap: 3, outline: 1, outlineColor: '#000000' }), dot({ radius: 1.5, color: '#00ff5e' })]
    },
    {
      id: 'preset-dot',
      name: 'Pure Dot',
      description: 'Just a dot, minimal aim.',
      ...base,
      layers: [dot({ radius: 4, color: '#ffffff', outline: 1.5, outlineColor: '#000000' })]
    },
    {
      id: 'preset-circle-dot',
      name: 'Circle Dot',
      description: 'Dot inside a ring.',
      ...base,
      layers: [circle({ radius: 9, thickness: 2, color: '#ffffff', outline: 1, outlineColor: '#000000' }), dot({ radius: 2.5, color: '#ffffff', outline: 1, outlineColor: '#000000' })]
    },
    {
      id: 'preset-t',
      name: 'T-Sight',
      description: 'Open T-shape sight picture.',
      ...base,
      layers: [t({ direction: 'up', color: '#00e5ff', length: 11, thickness: 2.5, gap: 5, outline: 1, outlineColor: '#000000' })]
    },
    {
      id: 'preset-sniper',
      name: 'Sniper',
      description: 'Long thin precision lines.',
      ...base,
      layers: [cross({ color: '#ffffff', length: 26, thickness: 1.5, gap: 4, outline: 1, outlineColor: '#000000' }), dot({ radius: 1.5, color: '#ffffff' })]
    },
    {
      id: 'preset-pro',
      name: 'Pro Stack',
      description: 'Cross + dot + outer ring.',
      ...base,
      layers: [
        circle({ radius: 16, thickness: 1.5, color: '#00ff5e', segments: 4, segAngle: 40 }),
        cross({ color: '#00ff5e', length: 12, thickness: 2.5, gap: 4 }),
        dot({ radius: 2.5, color: '#00ff5e', glow: 6, glowColor: '#00ff5e' })
      ]
    },
    {
      id: 'preset-neon',
      name: 'Neon',
      description: 'Glowing cyan cyber sight.',
      ...base,
      layers: [
        cross({ color: '#00e5ff', length: 15, thickness: 2.5, gap: 5, glow: 10, glowColor: '#00e5ff', roundCaps: true }),
        dot({ radius: 2, color: '#ffffff', glow: 8, glowColor: '#00e5ff' })
      ]
    },
    {
      id: 'preset-rainbow',
      name: 'Rainbow',
      description: 'Animated rainbow cross.',
      ...base,
      layers: [cross({ rainbow: true, rainbowSpeed: 1.2, length: 13, thickness: 3, gap: 5, outline: 1, outlineColor: '#000000' }), dot({ rainbow: true, rainbowSpeed: 1.2, radius: 3, outline: 1, outlineColor: '#000000' })]
    },
    {
      id: 'preset-box',
      name: 'Box Sight',
      description: 'Square reticle frame.',
      ...base,
      layers: [square({ size: 14, thickness: 2, color: '#ffd60a', outline: 1, outlineColor: '#000000' }), dot({ radius: 1.5, color: '#ffd60a' })]
    },
    {
      id: 'preset-white',
      name: 'Ghost',
      description: 'Crisp white with black outline.',
      ...base,
      layers: [cross({ color: '#ffffff', length: 12, thickness: 2.5, gap: 4, outline: 1.5, outlineColor: '#000000' })]
    },
    {
      id: 'preset-pulse',
      name: 'Pulse',
      description: 'Breathing animated ring.',
      ...base,
      layers: [
        circle({ radius: 10, thickness: 2, color: '#ff3355', animation: 'pulse', animSpeed: 2 }),
        dot({ radius: 2.5, color: '#ff3355', outline: 1, outlineColor: '#000000' })
      ]
    }
  ];
});
