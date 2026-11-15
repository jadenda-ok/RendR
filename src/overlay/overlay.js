(function () {
  const canvas = document.getElementById('surface');
  const ctx = canvas.getContext('2d');
  const fpsBox = document.getElementById('fps-box');
  let profile = null;
  let visible = true;
  let masterOpacity = 1;
  let fps = null;
  let W = 0, H = 0, DPR = 1;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(W * DPR));
    canvas.height = Math.max(1, Math.floor(H * DPR));
  }
  window.addEventListener('resize', resize);
  resize();

  window.overlayApi.on('overlay:profile', (p) => {
    profile = p;
  });

  window.overlayApi.on('overlay:visibility', (v) => {
    visible = v && v.show !== false;
    masterOpacity = v.masterOpacity != null ? v.masterOpacity : 1;
    if (!visible) ctx.clearRect(0, 0, canvas.width, canvas.height);
    syncFpsBox();
  });

  window.overlayApi.on('overlay:fps', (d) => {
    fps = d && d.fps != null ? d.fps : null;
    syncFpsBox();
  });

  function syncFpsBox() {
    const show = visible && fps != null;
    fpsBox.hidden = !show;
    if (show) {
      fpsBox.textContent = 'FPS ' + fps;
      fpsBox.style.opacity = String(masterOpacity);
    }
  }

  function frame(t) {
    requestAnimationFrame(frame);
    // Moving to a monitor with a different scale changes the ratio without a resize.
    if ((window.devicePixelRatio || 1) !== DPR) resize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!visible || !profile) return;
    const p = {
      ...profile,
      masterOpacity: (profile.masterOpacity != null ? profile.masterOpacity : 1) * masterOpacity
    };
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    CrosshairEngine.draw(ctx, p, W, H, t);
  }
  requestAnimationFrame(frame);
})();
