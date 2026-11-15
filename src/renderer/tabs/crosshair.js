// rendr — Crosshair tab: Studio, Presets, My Crosshairs.
(function () {
  const TabCrosshair = (window.TabCrosshair = window.TabCrosshair || {});
  const App = window.App;
  const api = window.api;
  const Engine = window.CrosshairEngine;
  const PRESETS = window.BUILTIN_PRESETS || [];
  const esc = (s) => App.escapeHtml(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, isNaN(v) ? a : v));

  let edited = null; // working copy of the profile being edited
  let selectedLayer = null; // index into edited.layers
  let pushTimer = null;
  let rafId = null;
  let sceneMode = 'scene'; // 'scene' | 'grid'
  let suppressActiveEvent = false;

  // ---------------- model helpers ----------------
  function profiles() {
    return App.state.store.profiles || [];
  }
  function saveProfiles(list) {
    App.state.store.profiles = list;
    api.setStore('profiles', list);
  }
  function newId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function uniqueName(base) {
    const names = new Set(profiles().map((p) => p.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(`${base} (${i})`)) i++;
    return `${base} (${i})`;
  }

  function defaultLayer(type) {
    const common = { visible: true, color: '#ffffff', opacity: 1, outline: 0, outlineColor: '#000000', glow: 0, glowColor: '#ffffff', rainbow: false, rainbowSpeed: 1, roundCaps: false };
    switch (type) {
      case 'cross': return { ...common, type: 'cross', length: 14, thickness: 3, gap: 6 };
      case 'dot': return { ...common, type: 'dot', radius: 3 };
      case 'circle': return { ...common, type: 'circle', radius: 12, thickness: 2, segments: 0, segAngle: 30 };
      case 't': return { ...common, type: 't', direction: 'up', length: 12, thickness: 3, gap: 6 };
      case 'square': return { ...common, type: 'square', size: 12, thickness: 2 };
      case 'image': return { visible: true, type: 'image', imageData: '', width: 64, height: 64, opacity: 1 };
      default: return { ...common, type: 'cross', length: 14, thickness: 3, gap: 6 };
    }
  }

  function newProfile(name) {
    return {
      id: newId(),
      name: name || 'New Crosshair',
      description: '',
      position: { x: 0.5, y: 0.5 },
      scale: 1,
      masterOpacity: 1,
      layers: [defaultLayer('cross')]
    };
  }

  function normalizeProfile(raw) {
    const p = {
      id: raw && raw.id || newId(),
      name: String(raw && raw.name || 'Imported Crosshair'),
      description: String(raw && raw.description || ''),
      position: {
        x: clamp(parseFloat(raw && raw.position && raw.position.x), 0, 1, 0.5),
        y: clamp(parseFloat(raw && raw.position && raw.position.y), 0, 1, 0.5)
      },
      scale: clamp(parseFloat(raw && raw.scale), 0.05, 20, 1),
      masterOpacity: clamp(parseFloat(raw && raw.masterOpacity), 0, 1, 1),
      layers: []
    };
    if (p.id == null || String(p.id).includes(' ')) p.id = newId();
    const layers = Array.isArray(raw && raw.layers) ? raw.layers : [];
    for (const rawLayer of layers) {
      if (!rawLayer || typeof rawLayer !== 'object') continue;
      const base = defaultLayer(rawLayer.type);
      const layer = { ...base, ...rawLayer };
      layer.type = base.type; // unknown types fall back to cross
      layer.visible = layer.visible !== false;
      if (typeof layer.imageData !== 'string') layer.imageData = '';
      layer.opacity = clamp(parseFloat(layer.opacity), 0, 1, 1);
      layer.outline = clamp(parseFloat(layer.outline), 0, 30, 0);
      layer.glow = clamp(parseFloat(layer.glow), 0, 60, 0);
      layer.rainbow = !!layer.rainbow;
      layer.roundCaps = !!layer.roundCaps;
      layer.length = clamp(parseFloat(layer.length), 0, 500, base.length);
      layer.thickness = clamp(parseFloat(layer.thickness), 0.5, 100, base.thickness);
      layer.gap = clamp(parseFloat(layer.gap), 0, 250, base.gap);
      layer.radius = clamp(parseFloat(layer.radius), 0.1, 250, base.radius);
      layer.size = clamp(parseFloat(layer.size), 0.1, 500, base.size);
      layer.segments = clamp(Math.round(layer.segments || 0), 0, 64, 0);
      layer.segAngle = clamp(parseFloat(layer.segAngle), 1, 360, base.segAngle);
      layer.width = clamp(parseFloat(layer.width), 4, 1024, base.width);
      layer.height = clamp(parseFloat(layer.height), 4, 1024, base.height);
      layer.rainbowSpeed = clamp(parseFloat(layer.rainbowSpeed), 0.05, 20, 1);
      layer.animSpeed = clamp(parseFloat(layer.animSpeed), 0.05, 20, 1);
      p.layers.push(layer);
    }
    return p;
  }

  function applyActiveOnOverlay(profile) {
    suppressActiveEvent = true;
    api.overlayApplyProfile(profile);
    setTimeout(() => { suppressActiveEvent = false; }, 300);
  }

  function schedulePush() {
    if (pushTimer) return;
    pushTimer = setTimeout(() => {
      pushTimer = null;
      if (!edited) return;
      const list = profiles();
      const idx = list.findIndex((p) => p.id === edited.id);
      if (idx === -1) return;
      list[idx] = edited;
      saveProfiles(list);
      if (App.state.store.activeProfileId === edited.id) {
        applyActiveOnOverlay(edited);
      }
      refreshSelects();
    }, 200);
  }

  function markEdited() {
    if (!edited) return;
    redrawPreview();
    schedulePush();
  }

  // ---------------- layer list ----------------
  function layerLabel(layer) {
    if (layer.name) return layer.name;
    switch (layer.type) {
      case 'cross': return 'Cross';
      case 'dot': return 'Dot';
      case 'circle': return 'Ring';
      case 't': return 'T-sight';
      case 'square': return 'Box';
      case 'image': return 'Image';
      default: return 'Layer';
    }
  }

  function buildLayerList() {
    const list = document.getElementById('layer-list');
    list.innerHTML = '';
    if (!edited) return;
    document.getElementById('layer-count').textContent = edited.layers.length + ' layer' + (edited.layers.length === 1 ? '' : 's');
    edited.layers.forEach((layer, i) => {
      const row = document.createElement('div');
      row.className = 'layer-item' + (i === selectedLayer ? ' selected' : '');
      const thumb = document.createElement('canvas');
      thumb.className = 'layer-thumb';
      thumb.width = 30; thumb.height = 30;
      App.renderProfileThumb(thumb, { ...newProfile('t'), layers: [layer] }, 30);
      row.appendChild(thumb);
      const name = document.createElement('span');
      name.className = 'layer-name';
      name.textContent = layerLabel(layer);
      row.appendChild(name);
      const ctl = document.createElement('div');
      ctl.className = 'layer-controls';
      ctl.innerHTML =
        `<button class="layer-move" data-a="up" title="Move up">▲</button>` +
        `<button class="layer-move" data-a="down" title="Move down">▼</button>` +
        `<button class="layer-move layer-del" data-a="del" title="Delete layer">✕</button>`;
      ctl.querySelector('[data-a="up"]').onclick = (e) => { e.stopPropagation(); moveLayer(i, -1); };
      ctl.querySelector('[data-a="down"]').onclick = (e) => { e.stopPropagation(); moveLayer(i, 1); };
      ctl.querySelector('[data-a="del"]').onclick = (e) => { e.stopPropagation(); removeLayer(i); };
      row.appendChild(ctl);
      row.addEventListener('click', () => selectLayer(i));
      list.appendChild(row);
    });
  }

  function moveLayer(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= edited.layers.length) return;
    const l = edited.layers[i];
    edited.layers[i] = edited.layers[j];
    edited.layers[j] = l;
    selectedLayer = j;
    buildLayerList();
    markEdited();
  }

  function removeLayer(i) {
    if (edited.layers.length <= 1) {
      App.toast('A crosshair needs at least one layer.', 'warn');
      return;
    }
    edited.layers.splice(i, 1);
    selectedLayer = Math.min(i, edited.layers.length - 1);
    buildLayerList();
    buildProps();
    markEdited();
  }

  function selectLayer(i) {
    selectedLayer = i;
    buildLayerList();
    buildProps();
  }

  function addLayer(type) {
    edited.layers.push(defaultLayer(type));
    selectedLayer = edited.layers.length - 1;
    buildLayerList();
    buildProps();
    markEdited();
  }

  // ---------------- properties ----------------
  const FIELD_SETS = {
    cross: [
      { k: 'length', label: 'Length', min: 2, max: 100 },
      { k: 'thickness', label: 'Thickness', min: 1, max: 30, step: 0.5 },
      { k: 'gap', label: 'Gap', min: 0, max: 60 }
    ],
    dot: [{ k: 'radius', label: 'Radius', min: 0.5, max: 60, step: 0.5 }],
    circle: [
      { k: 'radius', label: 'Radius', min: 1, max: 120 },
      { k: 'thickness', label: 'Thickness', min: 0.5, max: 30, step: 0.5 },
      { k: 'segments', label: 'Segments', min: 0, max: 32, int: true },
      { k: 'segAngle', label: 'Segment angle', min: 5, max: 360 }
    ],
    t: [
      { k: 'direction', label: 'Direction', enum: ['up', 'down', 'left', 'right'] },
      { k: 'length', label: 'Length', min: 2, max: 100 },
      { k: 'thickness', label: 'Thickness', min: 1, max: 30, step: 0.5 },
      { k: 'gap', label: 'Gap', min: 0, max: 60 }
    ],
    square: [
      { k: 'size', label: 'Size', min: 2, max: 120 },
      { k: 'thickness', label: 'Thickness', min: 0.5, max: 30, step: 0.5 }
    ],
    image: [
      { k: 'imageData', label: 'Image', type: 'image' },
      { k: 'width', label: 'Width', min: 8, max: 256 },
      { k: 'height', label: 'Height', min: 8, max: 256 }
    ]
  };

  function sliderVal(v, min, max, int) {
    return int ? Math.round(clamp(v, min, max)) : clamp(parseFloat(v), min, max);
  }

  function buildProps() {
    const body = document.getElementById('props-body');
    body.innerHTML = '';
    if (!edited || selectedLayer == null || !edited.layers[selectedLayer]) {
      body.innerHTML = '<div class="props-empty">Select a layer to edit its properties.</div>';
      return;
    }
    const layer = edited.layers[selectedLayer];

    const section = (label) => {
      const el = document.createElement('div');
      el.className = 'prop-section';
      el.textContent = label;
      body.appendChild(el);
    };

    // visible + name
    const nameRow = document.createElement('div');
    nameRow.className = 'prop-block';
    nameRow.innerHTML = '<label>Name</label>';
    const nameInput = document.createElement('input');
    nameInput.className = 'input';
    nameInput.type = 'text';
    nameInput.value = layer.name || '';
    nameInput.placeholder = layerLabel(layer);
    nameInput.addEventListener('input', () => {
      layer.name = nameInput.value.trim();
      buildLayerList();
      schedulePush();
    });
    nameRow.appendChild(nameInput);
    body.appendChild(nameRow);

    const visCheck = document.createElement('label');
    visCheck.className = 'prop-check';
    const visInput = document.createElement('input');
    visInput.type = 'checkbox';
    visInput.checked = layer.visible !== false;
    visInput.addEventListener('change', () => { layer.visible = visInput.checked; markEdited(); });
    visCheck.appendChild(visInput);
    visCheck.appendChild(document.createTextNode(' Visible'));
    body.appendChild(visCheck);

    // type-specific fields
    const fields = FIELD_SETS[layer.type] || [];
    if (fields.length) {
      section('SHAPE');
      for (const f of fields) {
        if (f.type === 'image') {
          const row = document.createElement('div');
          row.className = 'prop-block';
          row.innerHTML = '<label>Image</label>';
          const btn = document.createElement('button');
          btn.className = 'btn mini';
          btn.textContent = layer.imageData ? 'Replace image' : 'Pick image...';
          btn.addEventListener('click', async () => {
            const res = await api.pickImage();
            if (res && res.ok && res.dataUrl) {
              layer.imageData = res.dataUrl;
              markEdited();
              buildProps();
            } else if (res && res.error) App.toast(res.error, 'err');
          });
          row.appendChild(btn);
          if (layer.imageData) {
            const clr = document.createElement('button');
            clr.className = 'btn mini ghost';
            clr.textContent = 'Remove';
            clr.addEventListener('click', () => { layer.imageData = ''; markEdited(); buildProps(); });
            row.appendChild(clr);
          }
          body.appendChild(row);
          continue;
        }
        const row = document.createElement('div');
        row.className = 'prop-block';
        row.innerHTML = '<label></label>';
        row.querySelector('label').textContent = f.label;
        if (f.enum) {
          const sel = document.createElement('select');
          sel.className = 'input';
          for (const opt of f.enum) {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            sel.appendChild(o);
          }
          sel.value = layer[f.k] || f.enum[0];
          sel.addEventListener('change', () => { layer[f.k] = sel.value; markEdited(); });
          row.appendChild(sel);
        } else {
          const input = document.createElement('input');
          input.type = 'range';
          input.min = f.min;
          input.max = f.max;
          input.step = f.step || 1;
          input.value = sliderVal(layer[f.k] != null ? layer[f.k] : f.min, f.min, f.max, f.int);
          const val = document.createElement('span');
          val.className = 'val';
          val.textContent = f.int ? String(Math.round(parseFloat(input.value))) : parseFloat(input.value).toFixed(input.step && input.step < 1 ? 1 : 0);
          input.addEventListener('input', () => {
            layer[f.k] = sliderVal(parseFloat(input.value), f.min, f.max, f.int);
            val.textContent = f.int ? String(layer[f.k]) : Number(layer[f.k]).toFixed(f.step && f.step < 1 ? 1 : 0);
            markEdited();
          });
          row.appendChild(input);
          row.appendChild(val);
        }
        body.appendChild(row);
      }
    }

    // animation (except image)
    if (layer.type !== 'image') {
      section('ANIMATION');
      const animRow = document.createElement('div');
      animRow.className = 'prop-block';
      animRow.innerHTML = '<label>Style</label>';
      const sel = document.createElement('select');
      sel.className = 'input';
      for (const opt of ['none', 'pulse', 'rotate']) {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        sel.appendChild(o);
      }
      sel.value = layer.animation || 'none';
      sel.addEventListener('change', () => { layer.animation = sel.value === 'none' ? undefined : sel.value; markEdited(); buildProps(); });
      animRow.appendChild(sel);
      body.appendChild(animRow);

      const speedRow = document.createElement('div');
      speedRow.className = 'prop-block';
      speedRow.innerHTML = '<label>Speed</label>';
      const input = document.createElement('input');
      input.type = 'range';
      input.min = 0.1; input.max = 8; input.step = 0.1;
      input.value = layer.animSpeed || 1;
      const val = document.createElement('span');
      val.className = 'val';
      val.textContent = Number(input.value).toFixed(1);
      input.addEventListener('input', () => {
        layer.animSpeed = clamp(parseFloat(input.value), 0.1, 8);
        val.textContent = layer.animSpeed.toFixed(1);
        markEdited();
      });
      speedRow.appendChild(input);
      speedRow.appendChild(val);
      body.appendChild(speedRow);
    }

    if (layer.type !== 'image') {
      section('COLOR');
      const colorRow = document.createElement('div');
      colorRow.className = 'prop-block';
      colorRow.innerHTML = '<label>Color</label>';
      const color = document.createElement('input');
      color.type = 'color';
      color.value = layer.color || '#ffffff';
      color.addEventListener('input', () => { layer.color = color.value; markEdited(); });
      colorRow.appendChild(color);
      body.appendChild(colorRow);

      const opacityRow = rangeRow('Opacity', clamp((layer.opacity ?? 1) * 100, 0, 100), 0, 100, (v) => { layer.opacity = v / 100; });
      body.appendChild(opacityRow);

      const outlineRow = rangeRow('Outline', layer.outline || 0, 0, 15, (v) => { layer.outline = v; });
      body.appendChild(outlineRow);

      const outlineColorRow = document.createElement('div');
      outlineColorRow.className = 'prop-block';
      outlineColorRow.innerHTML = '<label>Out color</label>';
      const ocolor = document.createElement('input');
      ocolor.type = 'color';
      ocolor.value = layer.outlineColor || '#000000';
      ocolor.addEventListener('input', () => { layer.outlineColor = ocolor.value; markEdited(); });
      outlineColorRow.appendChild(ocolor);
      body.appendChild(outlineColorRow);

      const glowRow = rangeRow('Glow', layer.glow || 0, 0, 40, (v) => { layer.glow = v; });
      body.appendChild(glowRow);

      const glowColorRow = document.createElement('div');
      glowColorRow.className = 'prop-block';
      glowColorRow.innerHTML = '<label>Glow color</label>';
      const gcolor = document.createElement('input');
      gcolor.type = 'color';
      gcolor.value = layer.glowColor || layer.color || '#ffffff';
      gcolor.addEventListener('input', () => { layer.glowColor = gcolor.value; markEdited(); });
      glowColorRow.appendChild(gcolor);
      body.appendChild(glowColorRow);

      const rainbowCheck = document.createElement('label');
      rainbowCheck.className = 'prop-check';
      const rInput = document.createElement('input');
      rInput.type = 'checkbox';
      rInput.checked = !!layer.rainbow;
      rInput.addEventListener('change', () => { layer.rainbow = rInput.checked; markEdited(); buildProps(); });
      rainbowCheck.appendChild(rInput);
      rainbowCheck.appendChild(document.createTextNode(' Rainbow cycle'));
      body.appendChild(rainbowCheck);

      const speedRow2 = rangeRow('Rainbow speed', layer.rainbowSpeed || 1, 0.1, 10, (v) => { layer.rainbowSpeed = v; }, 0.1);
      body.appendChild(speedRow2);

      const capsCheck = document.createElement('label');
      capsCheck.className = 'prop-check';
      const cInput = document.createElement('input');
      cInput.type = 'checkbox';
      cInput.checked = !!layer.roundCaps;
      cInput.addEventListener('change', () => { layer.roundCaps = cInput.checked; markEdited(); });
      capsCheck.appendChild(cInput);
      capsCheck.appendChild(document.createTextNode(' Round caps'));
      body.appendChild(capsCheck);
    } else {
      section('IMAGE');
      const opRow = rangeRow('Opacity', clamp((layer.opacity ?? 1) * 100, 0, 100), 0, 100, (v) => { layer.opacity = v / 100; });
      body.appendChild(opRow);
    }
  }

  function rangeRow(label, value, min, max, onSet, step = 1) {
    const row = document.createElement('div');
    row.className = 'prop-block';
    row.innerHTML = '<label></label>';
    row.querySelector('label').textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min; input.max = max; input.step = step;
    input.value = value;
    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = Math.round(value) + (step < 1 ? '' : '');
    if (step < 1) val.textContent = Number(value).toFixed(1);
    input.addEventListener('input', () => {
      onSet(clamp(parseFloat(input.value), min, max));
      val.textContent = step < 1 ? Number(input.value).toFixed(1) : Math.round(input.value);
      markEdited();
    });
    row.appendChild(input);
    row.appendChild(val);
    return row;
  }

  // ---------------- preview ----------------
  function drawScene(ctx, w, h) {
    if (sceneMode === 'grid') {
      const s = 16;
      for (let y = 0; y < h; y += s) {
        for (let x = 0; x < w; x += s) {
          ctx.fillStyle = ((x / s + y / s) % 2 === 0) ? '#16161a' : '#101013';
          ctx.fillRect(x, y, s, s);
        }
      }
      return;
    }
    // Fake game scene: sky gradient, horizon glow, perspective floor grid, vignette.
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#1d1d22');
    sky.addColorStop(0.55, '#141417');
    sky.addColorStop(1, '#0c0c0e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const horizon = h * 0.58;
    const floor = ctx.createLinearGradient(0, horizon, 0, h);
    floor.addColorStop(0, '#161619');
    floor.addColorStop(1, '#0b0b0d');
    ctx.fillStyle = floor;
    ctx.fillRect(0, horizon, w, h - horizon);

    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 14; i++) {
      const x = (i / 14) * w;
      ctx.beginPath();
      ctx.moveTo(x, horizon);
      ctx.lineTo(w / 2 + (x - w / 2) * 3.4, h);
      ctx.stroke();
    }
    for (let j = 0; j < 7; j++) {
      const t = j / 7;
      const y = horizon + Math.pow(t, 1.8) * (h - horizon);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const glow = ctx.createLinearGradient(0, horizon - 26, 0, horizon);
    glow.addColorStop(0, 'rgba(255,255,255,0)');
    glow.addColorStop(1, 'rgba(255,255,255,0.10)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, horizon - 26, w, 26);

    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  function redrawPreview() {
    const canvas = document.getElementById('preview-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    drawScene(ctx, w, h);
    if (edited) Engine.draw(ctx, edited, w, h, performance.now());
  }

  function previewLoop() {
    rafId = requestAnimationFrame(previewLoop);
    const page = document.getElementById('page-crosshair-studio');
    if (!page || !page.classList.contains('active')) return;
    redrawPreview();
  }

  function refreshProfileSliders() {
    if (!edited) return;
    document.getElementById('pos-x').value = Math.round(edited.position.x * 100);
    document.getElementById('pos-x-val').textContent = Math.round(edited.position.x * 100) + '%';
    document.getElementById('pos-y').value = Math.round(edited.position.y * 100);
    document.getElementById('pos-y-val').textContent = Math.round(edited.position.y * 100) + '%';
    document.getElementById('prof-scale').value = Math.round(edited.scale * 100);
    document.getElementById('prof-scale-val').textContent = edited.scale.toFixed(2) + 'x';
    document.getElementById('prof-opacity').value = Math.round(edited.masterOpacity * 100);
    document.getElementById('prof-opacity-val').textContent = Math.round(edited.masterOpacity * 100) + '%';
  }

  // ---------------- toolbar / select ----------------
  function refreshSelects() {
    const sel = document.getElementById('profile-select');
    if (!sel) return;
    const list = profiles();
    sel.innerHTML = '';
    for (const p of list) {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name;
      sel.appendChild(o);
    }
    if (edited && list.some((p) => p.id === edited.id)) sel.value = edited.id;
    else if (list.length) sel.value = list[0].id;
  }

  function openProfile(id) {
    const list = profiles();
    const p = list.find((x) => x.id === id) || list[0];
    if (!p) {
      edited = null;
      selectedLayer = null;
      buildLayerList();
      buildProps();
      refreshSelects();
      return;
    }
    edited = JSON.parse(JSON.stringify(p));
    selectedLayer = edited.layers.length ? 0 : null;
    applyActiveOnOverlay(p);
    buildLayerList();
    buildProps();
    refreshProfileSliders();
    refreshSelects();
    redrawPreview();
  }

  // ---------------- studio refresh ----------------
  function studioRefresh() {
    refreshSelects();
    if (!edited && profiles().length) openProfile(App.state.store.activeProfileId || profiles()[0].id);
    buildLayerList();
    buildProps();
    refreshProfileSliders();
    redrawPreview();
  }

  // ---------------- presets page ----------------
  function presetsRefresh() {
    const grid = document.getElementById('preset-grid');
    grid.innerHTML = '';
    for (const preset of PRESETS) {
      const card = document.createElement('div');
      card.className = 'gallery-card';
      const preview = document.createElement('div');
      preview.className = 'gallery-preview';
      const canvas = document.createElement('canvas');
      App.renderProfileThumb(canvas, preset, 96);
      preview.appendChild(canvas);
      card.appendChild(preview);
      const info = document.createElement('div');
      info.className = 'gallery-info';
      info.innerHTML = `<div class="gallery-name">${esc(preset.name)}</div><div class="gallery-desc">${esc(preset.description)}</div>`;
      card.appendChild(info);
      card.addEventListener('click', () => {
        const clone = normalizeProfile(JSON.parse(JSON.stringify(preset)));
        clone.id = newId();
        clone.name = uniqueName(preset.name);
        const list = profiles();
        list.push(clone);
        saveProfiles(list);
        App.state.store.activeProfileId = clone.id;
        applyActiveOnOverlay(clone);
        openProfile(clone.id);
        App.openPage('crosshair', 'studio');
        App.toast(`"${clone.name}" is now your active crosshair.`, 'ok');
      });
      grid.appendChild(card);
    }
  }

  // ---------------- my crosshairs page ----------------
  function mineRefresh() {
    const grid = document.getElementById('mine-grid');
    grid.innerHTML = '';
    const list = profiles();
    if (!list.length) {
      grid.innerHTML = '<div class="empty-card">No crosshairs yet. Open the Studio or pick a preset to create one.</div>';
      return;
    }
    const activeId = App.state.store.activeProfileId;
    for (const p of list) {
      const card = document.createElement('div');
      card.className = 'gallery-card';
      const preview = document.createElement('div');
      preview.className = 'gallery-preview';
      const canvas = document.createElement('canvas');
      App.renderProfileThumb(canvas, p, 96);
      preview.appendChild(canvas);
      card.appendChild(preview);
      const info = document.createElement('div');
      info.className = 'gallery-info';
      info.innerHTML =
        `<div class="gallery-name">${esc(p.name)}</div>` +
        `<div class="gallery-desc">${p.layers.length} layer${p.layers.length === 1 ? '' : 's'}</div>` +
        `<div class="gallery-foot"><span class="gallery-badge ${p.id === activeId ? 'active' : ''}">${p.id === activeId ? 'Active' : 'Saved'}</span>` +
        `<span class="gallery-actions">` +
        `<button class="layer-move" data-a="use" title="Use this crosshair">✓</button>` +
        `<button class="layer-move" data-a="dup" title="Duplicate">⧉</button>` +
        `<button class="layer-move layer-del" data-a="del" title="Delete">✕</button></span></div>`;
      card.appendChild(info);
      info.querySelector('[data-a="use"]').addEventListener('click', (e) => {
        e.stopPropagation();
        App.state.store.activeProfileId = p.id;
        applyActiveOnOverlay(p);
        App.toast(`"${p.name}" is now active.`, 'ok');
        mineRefresh();
        App.refreshSidebarStatus();
      });
      info.querySelector('[data-a="dup"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        const clone = normalizeProfile(JSON.parse(JSON.stringify(p)));
        clone.id = newId();
        clone.name = uniqueName(p.name + ' copy');
        const l = profiles();
        l.push(clone);
        saveProfiles(l);
        mineRefresh();
        App.toast(`Duplicated as "${clone.name}".`, 'ok');
      });
      info.querySelector('[data-a="del"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteProfile(p.id);
        mineRefresh();
      });
      card.addEventListener('click', () => {
        App.state.store.activeProfileId = p.id;
        applyActiveOnOverlay(p);
        openProfile(p.id);
        App.openPage('crosshair', 'studio');
      });
      grid.appendChild(card);
    }
  }

  async function deleteProfile(id) {
    const list = profiles();
    const p = list.find((x) => x.id === id);
    if (!p) return;
    if (!(await App.confirm('Delete crosshair', `Delete "${p.name}"? This cannot be undone.`, 'Delete'))) return;
    const wasActive = App.state.store.activeProfileId === id;
    const idx = list.findIndex((x) => x.id === id);
    list.splice(idx, 1);
    let newActive = null;
    if (wasActive) {
      const next = list[Math.min(idx, list.length - 1)] || null;
      App.state.store.activeProfileId = next ? next.id : null;
      newActive = next;
    }
    saveProfiles(list);
    applyActiveOnOverlay(newActive); // null clears the overlay
    App.refreshSidebarStatus();
    if (edited && edited.id === id) {
      edited = list.length ? normalizeProfile(JSON.parse(JSON.stringify(list[Math.min(idx, list.length - 1)]))) : null;
      selectedLayer = edited && edited.layers.length ? 0 : null;
      buildLayerList();
      buildProps();
      refreshProfileSliders();
    }
    refreshSelects();
    App.toast(`Deleted "${p.name}".`, 'ok');
  }

  // ---------------- init ----------------
  document.addEventListener('app:ready', () => {
    App.registerRefresh('crosshair', 'studio', studioRefresh);
    App.registerRefresh('crosshair', 'presets', presetsRefresh);
    App.registerRefresh('crosshair', 'profiles', mineRefresh);

    document.getElementById('profile-select').addEventListener('change', (e) => {
      const p = profiles().find((x) => x.id === e.target.value);
      if (!p) return;
      App.state.store.activeProfileId = p.id;
      applyActiveOnOverlay(p);
      openProfile(p.id);
    });

    document.getElementById('btn-new-profile').addEventListener('click', async () => {
      const name = await App.promptModal('New crosshair', 'Name your new crosshair:', uniqueName('New Crosshair'));
      if (name == null) return;
      const p = newProfile(name || 'New Crosshair');
      const list = profiles();
      list.push(p);
      saveProfiles(list);
      App.state.store.activeProfileId = p.id;
      applyActiveOnOverlay(p);
      openProfile(p.id);
    });

    document.getElementById('btn-dup-profile').addEventListener('click', () => {
      if (!edited) return;
      const clone = normalizeProfile(JSON.parse(JSON.stringify(edited)));
      clone.id = newId();
      clone.name = uniqueName(edited.name + ' copy');
      const list = profiles();
      list.push(clone);
      saveProfiles(list);
      openProfile(clone.id);
      App.toast(`Duplicated as "${clone.name}".`, 'ok');
    });

    document.getElementById('btn-rename-profile').addEventListener('click', async () => {
      if (!edited) return;
      const name = await App.promptModal('Rename crosshair', 'New name:', edited.name);
      if (name == null || !name) return;
      edited.name = name;
      const list = profiles();
      const p = list.find((x) => x.id === edited.id);
      if (p) p.name = name;
      saveProfiles(list);
      refreshSelects();
      App.refreshSidebarStatus();
      App.toast('Renamed.', 'ok');
    });

    document.getElementById('btn-del-profile').addEventListener('click', async () => {
      if (!edited) return;
      await deleteProfile(edited.id);
    });

    document.getElementById('btn-export-profile').addEventListener('click', async () => {
      if (!edited) return;
      const res = await api.profilesExport(JSON.parse(JSON.stringify(edited)));
      if (res && res.ok) App.toast('Profile exported.', 'ok');
      else if (res && res.error) App.toast(res.error, 'err');
    });

    document.getElementById('btn-import-profile').addEventListener('click', async () => {
      const res = await api.profilesImport();
      if (!res || !res.ok) {
        if (!res || !res.canceled) App.toast((res && res.error) || 'Import failed.', 'err');
        return;
      }
      const p = normalizeProfile(res.profile);
      p.id = newId();
      p.name = uniqueName(p.name);
      const list = profiles();
      list.push(p);
      saveProfiles(list);
      App.state.store.activeProfileId = p.id;
      applyActiveOnOverlay(p);
      openProfile(p.id);
      App.toast(`Imported "${p.name}".`, 'ok');
    });

    document.getElementById('btn-export-png').addEventListener('click', async () => {
      if (!edited) return;
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      Engine.draw(ctx, edited, size, size, 0);
      const res = await api.profilesExportImage(canvas.toDataURL('image/png'));
      if (res && res.ok) App.toast('PNG saved.', 'ok');
      else if (res && res.error) App.toast(res.error, 'err');
    });

    document.getElementById('btn-test-overlay').addEventListener('click', () => {
      if (!edited) return;
      api.overlayPreview(JSON.parse(JSON.stringify(edited)), 5);
      App.toast('Showing on screen for 5 seconds.', 'ok');
    });

    document.getElementById('btn-bg-toggle').addEventListener('click', (e) => {
      sceneMode = sceneMode === 'scene' ? 'grid' : 'scene';
      e.target.textContent = sceneMode === 'scene' ? 'BG: Scene' : 'BG: Grid';
      redrawPreview();
    });

    document.querySelectorAll('#layers-panel [data-add]').forEach((b) => {
      b.addEventListener('click', () => addLayer(b.dataset.add));
    });

    const bindProfSlider = (id, onSet) => {
      document.getElementById(id).addEventListener('input', (e) => {
        if (!edited) return;
        onSet(e);
        markEdited();
      });
    };
    bindProfSlider('pos-x', (e) => {
      edited.position.x = clamp(parseInt(e.target.value, 10), 0, 100) / 100;
      document.getElementById('pos-x-val').textContent = e.target.value + '%';
    });
    bindProfSlider('pos-y', (e) => {
      edited.position.y = clamp(parseInt(e.target.value, 10), 0, 100) / 100;
      document.getElementById('pos-y-val').textContent = e.target.value + '%';
    });
    bindProfSlider('prof-scale', (e) => {
      edited.scale = clamp(parseInt(e.target.value, 10), 5, 2000) / 100;
      document.getElementById('prof-scale-val').textContent = edited.scale.toFixed(2) + 'x';
    });
    bindProfSlider('prof-opacity', (e) => {
      edited.masterOpacity = clamp(parseInt(e.target.value, 10), 0, 100) / 100;
      document.getElementById('prof-opacity-val').textContent = e.target.value + '%';
    });

    document.addEventListener('rendr:activeProfile', (e) => {
      if (suppressActiveEvent) return;
      const p = e.detail;
      if (p && edited && p.id === edited.id) {
        // profile changed elsewhere — reload it into the editor
        edited = normalizeProfile(JSON.parse(JSON.stringify(p)));
        selectedLayer = edited.layers.length ? Math.min(selectedLayer || 0, edited.layers.length - 1) : null;
        buildLayerList();
        buildProps();
        refreshProfileSliders();
      }
      refreshSelects();
      App.refreshSidebarStatus();
    });

    document.addEventListener('rendr:reset', () => {
      edited = null;
      selectedLayer = null;
      studioRefresh();
    });

    previewLoop();
  });
})();
