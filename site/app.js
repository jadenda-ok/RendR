(function () {
  'use strict';

  var RELEASES = 'https://api.github.com/repos/jadenda-ok/RendR/releases/latest';
  var INSTALLER_FALLBACK = 'https://github.com/jadenda-ok/RendR/releases/latest/download/rendr-setup.exe';
  var PORTABLE_FALLBACK = 'https://github.com/jadenda-ok/RendR/releases/latest/download/Rendr-Portable-1.1.0.exe';

  function setText(sel, text) {
    var el = document.querySelector(sel);
    if (el) el.textContent = text;
  }
  function setHref(sel, href) {
    document.querySelectorAll(sel).forEach(function (el) { el.href = href; });
  }

  fetch(RELEASES)
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (rel) {
      if (!rel) return;
      var version = String(rel.tag_name || '').replace(/^v/, '');
      var installer = rel.assets.filter(function (a) { return a.name === 'rendr-setup.exe'; })[0];
      var portable = rel.assets.filter(function (a) { return /portable/i.test(a.name); })[0];
      setText('#pill-version', 'v' + version);
      setText('#footer-version', 'Latest release: v' + version);
      if (installer) setHref('#nav-download, #hero-download, #footer-download', installer.browser_download_url);
      if (portable) setHref('#portable-link', portable.browser_download_url);
    })
    .catch(function () { /* keep static fallbacks */ });

  var io = 'IntersectionObserver' in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            io.unobserve(e.target);
          }
        });
      }, { threshold: 0.12 })
    : null;

  document.querySelectorAll('.reveal').forEach(function (el) {
    if (io) io.observe(el);
    else el.classList.add('visible');
  });
})();
