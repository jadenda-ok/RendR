// Crosshair rendering engine. Shared by the overlay window and the editor preview.
// Draws a crosshair profile onto a 2D canvas context.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CrosshairEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TAU = Math.PI * 2;

  function parseHex(hex) {
    let h = String(hex || '#ffffff').trim();
    if (h.startsWith('#')) h = h.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return { r: 255, g: 255, b: 255 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function hueShift(hex, shift) {
    const { r, g, b } = parseHex(hex);
    const h = hueOf(r, g, b);
    return `hsl(${(h + shift) % 360}, ${satOf(r, g, b)}%, ${lgtOf(r, g, b)}%)`;
  }

  function hueOf(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max === min) return 0;
    const d = max - min;
    let h;
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    return Math.round(h * 60 + 360) % 360;
  }
  function satOf(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max === 0 || max === min) return 0;
    return Math.round(((max - min) / max) * 100);
  }
  function lgtOf(r, g, b) {
    return Math.round(((Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255) * 100);
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  // Resolve the paint style for a layer at time t (ms). Handles rainbow, gradient.
  function paintFor(ctx, layer, t, bounds) {
    let stroke = layer.color || '#ffffff';
    let fill = stroke;
    if (layer.rainbow) {
      const speed = (layer.rainbowSpeed || 1) * 0.09;
      // rainbowOffset is already degrees (0-360) from the UI slider.
      const hue = (t * speed + (layer.rainbowOffset || 0)) % 360;
      stroke = `hsl(${hue}, 90%, 55%)`;
      fill = stroke;
    } else if (layer.useGradient && layer.color2) {
      const g = ctx.createLinearGradient(bounds.x1, bounds.y1, bounds.x2, bounds.y2);
      g.addColorStop(0, layer.color);
      g.addColorStop(1, layer.color2);
      stroke = g;
      fill = g;
    }
    return { stroke, fill };
  }

  function applyGlow(ctx, layer, active) {
    if (active && layer.glow > 0) {
      ctx.shadowColor = layer.glowColor || layer.color || '#ffffff';
      ctx.shadowBlur = layer.glow;
    } else {
      ctx.shadowBlur = 0;
    }
  }

  function setDash(ctx, layer, on) {
    if (on && layer.dashed) ctx.setLineDash([layer.dashLength || 8, layer.dashLength || 8]);
    else ctx.setLineDash([]);
  }
  function setCaps(ctx, layer) {
    ctx.lineCap = layer.roundCaps ? 'round' : 'butt';
  }

  // Strokes the currently-open path: first an outline pass (if any), then the main pass.
  function strokeWithOutline(ctx, layer, paint) {
    setDash(ctx, layer, true);
    setCaps(ctx, layer);
    if (layer.outline > 0) {
      ctx.lineWidth = layer.thickness + layer.outline * 2;
      ctx.strokeStyle = layer.outlineColor || '#000000';
      applyGlow(ctx, layer, false);
      ctx.stroke();
    }
    ctx.lineWidth = layer.thickness;
    ctx.strokeStyle = paint.stroke;
    applyGlow(ctx, layer, true);
    ctx.stroke();
    applyGlow(ctx, layer, false);
  }

  function fillWithOutline(ctx, drawFn, radius, layer, paint) {
    if (layer.outline > 0) {
      ctx.fillStyle = layer.outlineColor || '#000000';
      drawFn(radius + layer.outline);
      ctx.fill();
    }
    ctx.fillStyle = paint.fill;
    applyGlow(ctx, layer, true);
    drawFn(radius);
    ctx.fill();
    applyGlow(ctx, layer, false);
  }

  function drawCross(ctx, layer, paint) {
    const len = Math.max(0, layer.length), gap = Math.max(0, layer.gap);
    ctx.beginPath();
    ctx.moveTo(0, -gap - len); ctx.lineTo(0, -gap);
    ctx.moveTo(0, gap); ctx.lineTo(0, gap + len);
    ctx.moveTo(-gap - len, 0); ctx.lineTo(-gap, 0);
    ctx.moveTo(gap, 0); ctx.lineTo(gap + len, 0);
    strokeWithOutline(ctx, layer, paint);
  }

  function drawT(ctx, layer, paint) {
    const len = Math.max(0, layer.length), gap = Math.max(0, layer.gap);
    ctx.beginPath();
    ctx.moveTo(0, -gap - len); ctx.lineTo(0, -gap);
    ctx.moveTo(-gap - len, gap * 0.4); ctx.lineTo(-gap, gap * 0.4);
    ctx.moveTo(gap, gap * 0.4); ctx.lineTo(gap + len, gap * 0.4);
    strokeWithOutline(ctx, layer, paint);
  }

  function drawCircle(ctx, layer, paint) {
    const r = Math.max(0.1, layer.radius), th = Math.max(0.1, layer.thickness);
    const segments = layer.segments || 0;
    const segAngle = ((layer.segAngle || 40) * Math.PI) / 180;
    if (segments > 0) {
      const gapAngle = segAngle / segments;
      const piece = (TAU - segAngle) / segments;
      if (layer.outline > 0) {
        ctx.lineWidth = th + layer.outline * 2;
        ctx.strokeStyle = layer.outlineColor || '#000000';
        for (let i = 0; i < segments; i++) {
          const a = i * (piece + gapAngle) + gapAngle / 2;
          ctx.beginPath();
          ctx.arc(0, 0, r, a, a + piece);
          ctx.stroke();
        }
      }
      ctx.lineWidth = th;
      ctx.strokeStyle = paint.stroke;
      applyGlow(ctx, layer, true);
      for (let i = 0; i < segments; i++) {
        const a = i * (piece + gapAngle) + gapAngle / 2;
        ctx.beginPath();
        ctx.arc(0, 0, r, a, a + piece);
        ctx.stroke();
      }
      applyGlow(ctx, layer, false);
    } else {
      if (layer.outline > 0) {
        ctx.lineWidth = th + layer.outline * 2;
        ctx.strokeStyle = layer.outlineColor || '#000000';
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
      }
      ctx.lineWidth = th;
      ctx.strokeStyle = paint.stroke;
      applyGlow(ctx, layer, true);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
      applyGlow(ctx, layer, false);
    }
  }

  function drawDot(ctx, layer, paint) {
    const r = Math.max(layer.radius, 0.1);
    fillWithOutline(ctx, (rr) => {
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
    }, r, layer, paint);
  }

  function drawSquare(ctx, layer, paint) {
    const s = Math.max(0.1, layer.size);
    ctx.beginPath();
    ctx.rect(-s / 2, -s / 2, s, s);
    strokeWithOutline(ctx, layer, paint);
  }

  // Image layers are cached by their data URL string. Never store DOM objects
  // on the profile itself: profiles cross IPC via structured clone and would
  // fail to save.
  const imageCache = new Map();

  function imageFor(layer) {
    if (!layer.imageData) return null;
    let img = imageCache.get(layer.imageData);
    if (!img) {
      img = new Image();
      img.src = layer.imageData;
      imageCache.set(layer.imageData, img);
    }
    return img;
  }

  function drawImageLayer(ctx, layer) {
    const img = imageFor(layer);
    if (!img || !img.complete || !img.naturalWidth) return;
    const size = layer.imageSize || 24;
    ctx.save();
    try {
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
    } catch {
      // Broken image data must not leave the context in an unbalanced state.
      imageCache.delete(layer.imageData);
    }
    ctx.restore();
  }

  function layerBounds(layer) {
    const s = Math.max(
      (layer.type === 'circle' ? layer.radius + layer.thickness + (layer.outline || 0) : 0),
      (layer.type === 'cross' ? layer.gap + layer.length : 0),
      (layer.type === 't' ? layer.gap + layer.length : 0),
      (layer.type === 'square' ? layer.size / 2 : 0),
      (layer.type === 'dot' ? layer.radius + (layer.outline || 0) : 0),
      (layer.type === 'image' ? (layer.imageSize || 24) / 2 : 0)
    );
    return { x1: -s, y1: -s, x2: s, y2: s };
  }

  function drawLayer(ctx, layer, t, cx, cy, scale) {
    if (!layer || layer.visible === false) return;
    const alpha = layer.opacity != null ? layer.opacity : 1;
    if (alpha <= 0) return;

    const bounds = layerBounds(layer);
    const paint = paintFor(ctx, layer, t, bounds);

    ctx.save();
    ctx.translate(cx + (layer.offsetX || 0) * scale, cy + (layer.offsetY || 0) * scale);

    let s = scale;
    if (layer.animation === 'pulse') {
      s *= 1 + 0.14 * Math.sin((t / 1000) * TAU * (layer.animSpeed || 1));
    }
    ctx.scale(s, s);

    let rot = ((layer.rotation || 0) * Math.PI) / 180;
    if (layer.animation === 'rotate') {
      rot += (t / 1000) * (layer.animSpeed || 0.6) * TAU * 0.25;
    }
    ctx.rotate(rot);

    if (layer.type === 't') {
      const dirMap = { up: 0, right: 90, down: 180, left: 270 };
      ctx.rotate(((dirMap[layer.direction] || 0) * Math.PI) / 180);
    }

    // Multiply: the context may already carry the profile's master opacity.
    ctx.globalAlpha *= alpha;

    switch (layer.type) {
      case 'cross': drawCross(ctx, layer, paint); break;
      case 't': drawT(ctx, layer, paint); break;
      case 'circle': drawCircle(ctx, layer, paint); break;
      case 'dot': drawDot(ctx, layer, paint); break;
      case 'square': drawSquare(ctx, layer, paint); break;
      case 'image': drawImageLayer(ctx, layer); break;
    }

    ctx.restore();
  }

  function draw(ctx, profile, width, height, timeMs) {
    if (!profile) return;
    ctx.save();
    // No clearRect here: the overlay page clears its own transparent canvas,
    // and the editor preview draws its scene background first.
    ctx.globalAlpha = clamp(profile.masterOpacity != null ? profile.masterOpacity : 1, 0, 1);
    const cx = (profile.position ? profile.position.x : 0.5) * width;
    const cy = (profile.position ? profile.position.y : 0.5) * height;
    const scale = (profile.scale || 1);
    for (const layer of profile.layers || []) {
      drawLayer(ctx, layer, timeMs, cx, cy, scale);
    }
    ctx.restore();
  }

  return {
    draw,
    parseHex,
    hueShift,
    TAU,
    clamp
  };
});
