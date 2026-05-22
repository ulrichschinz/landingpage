/**
 * Agentic Reach — Sprach-Routing
 *
 * Quelle der Wahrheit: URL-Parameter `?lang=de|en`.
 * Fallbacks: localStorage → Browser-Sprache → 'de'.
 *
 * Bei jedem Seitenwechsel wird der aktuelle Lang-Parameter an alle
 * internen Links angehängt, damit die Sprache erhalten bleibt.
 *
 * API:
 *   ARLang.get()                       aktuelle Sprache
 *   ARLang.set('de' | 'en')            Sprache wechseln (feuert ar:langchange)
 *   ARLang.rewriteLinks(root?)         interne Links neu beschriften
 *
 *   Event: window.addEventListener('ar:langchange', e => e.detail.lang)
 *
 * Opt-out pro Link: <a data-no-lang ...>  (z. B. Sprach-Toggle in Legal-Seiten)
 */
(function () {
  var VALID = ['de', 'en'];
  var STORAGE_KEY = 'ar_lang';

  function isValid(l) { return VALID.indexOf(l) !== -1; }

  function detectInitial() {
    var params = new URLSearchParams(location.search);
    var urlLang = params.get('lang');
    if (isValid(urlLang)) return { lang: urlLang, fromUrl: true };

    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (isValid(stored)) return { lang: stored, fromUrl: false };

    var nav = (navigator.language || '').slice(0, 2).toLowerCase();
    return { lang: nav === 'en' ? 'en' : 'de', fromUrl: false };
  }

  var state = detectInitial();
  var lang = state.lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}

  // URL ggf. mit Parameter ergänzen, damit Sharing/Reload konsistent sind.
  if (!state.fromUrl) {
    var p0 = new URLSearchParams(location.search);
    p0.set('lang', lang);
    history.replaceState(null, '', location.pathname + '?' + p0.toString() + location.hash);
  }

  // Hängt ?lang=<aktuell> an einen href-String an (relative oder absolute Pfade).
  // Externe Schemata (http/mailto/tel/...) und reine Anker (#foo) bleiben unverändert.
  function withLang(href) {
    if (!href) return href;
    if (/^(https?:|mailto:|tel:|javascript:|data:)/i.test(href)) return href;
    if (href.charAt(0) === '#') return href;

    var hashIdx = href.indexOf('#');
    var hash = hashIdx >= 0 ? href.slice(hashIdx) : '';
    var noHash = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
    var queryIdx = noHash.indexOf('?');
    var path = queryIdx >= 0 ? noHash.slice(0, queryIdx) : noHash;
    var queryStr = queryIdx >= 0 ? noHash.slice(queryIdx + 1) : '';

    var params = new URLSearchParams(queryStr);
    params.set('lang', lang);
    return path + '?' + params.toString() + hash;
  }

  function rewriteLinks(root) {
    var scope = root || document;
    var anchors = scope.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      if (a.hasAttribute('data-no-lang')) continue;
      var href = a.getAttribute('href');
      a.setAttribute('href', withLang(href));
    }
  }

  function set(newLang) {
    if (!isValid(newLang)) return;
    if (newLang === lang) return;
    lang = newLang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    var p = new URLSearchParams(location.search);
    p.set('lang', lang);
    history.replaceState(null, '', location.pathname + '?' + p.toString() + location.hash);
    window.dispatchEvent(new CustomEvent('ar:langchange', { detail: { lang: lang } }));
  }

  window.ARLang = {
    get: function () { return lang; },
    set: set,
    rewriteLinks: rewriteLinks,
    withLang: withLang,
  };

  // Initial Rewrite + bei jedem Sprachwechsel.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { rewriteLinks(); });
  } else {
    rewriteLinks();
  }
  window.addEventListener('ar:langchange', function () { rewriteLinks(); });
})();
