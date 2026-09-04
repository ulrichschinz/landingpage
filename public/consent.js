/**
 * Agentic Reach — Cookie-Einwilligung (§ 25 Abs. 1 TDDDG, Art. 6 Abs. 1 lit. a DSGVO)
 *
 * Gate für Venta AI (april.eleven GmbH). Das Tracking-Skript wird erst geladen,
 * wenn eine Einwilligung vorliegt — nicht vorher. Ohne Einwilligung findet
 * weder eine Speicherung auf dem Endgerät noch eine Übermittlung an
 * api.getventa.ai statt.
 *
 * Bewusst NICHT `waitForConsent: true` von Venta: diese Option verhindert nur
 * das persistente Speichern, das Skript wird trotzdem geladen und sendet
 * weiterhin Daten (inkl. IP). Für eine belastbare Einwilligungslösung muss das
 * Skript vollständig ungeladen bleiben.
 *
 * Speicherung der Entscheidung: localStorage `ar_consent`
 *   { v: <policyVersion>, state: 'granted' | 'denied', ts: <ISO-Datum> }
 * Das ist selbst kein einwilligungspflichtiger Vorgang — die Speicherung ist
 * zur Umsetzung des Nutzerwunsches unbedingt erforderlich (§ 25 Abs. 2 TDDDG).
 *
 * API:
 *   ARConsent.get()      -> 'granted' | 'denied' | null
 *   ARConsent.grant()    Einwilligung erteilen (lädt Venta)
 *   ARConsent.deny()     Einwilligung ablehnen
 *   ARConsent.revoke()   Widerruf: löscht Entscheidung + gesetzte Einträge,
 *                        zeigt das Banner erneut
 *   ARConsent.open()     Banner manuell öffnen (z. B. „Cookie-Einstellungen")
 *
 *   Event: window.addEventListener('ar:consentchange', e => e.detail.state)
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'ar_consent';
  // Bei inhaltlicher Änderung des Zwecks hochzählen — erneuert die Einwilligung.
  var POLICY_VERSION = 1;

  var VENTA_SETTINGS = {
    cdn: 'cdn.getventa.ai',
    apiEndpoint: 'api.getventa.ai',
    profileId: 'ronbWwvHhGk',
    namespace: 'Venta',
    waitForConsent: false,
    features: { downloadTracking: true, formTracking: true }
  };

  // Von Venta gesetzte Einträge — für den Widerruf.
  var VENTA_COOKIE_PREFIXES = ['venta_', '__sn_tld_probe'];
  var VENTA_STORAGE_PREFIXES = ['venta_', 'radar_'];

  var TEXT = {
    de: {
      title: 'Cookies & Analyse',
      body: 'Wir würden gern messen, wie diese Seite genutzt wird. Dafür setzt der Dienst ' +
            'Venta AI ein Cookie und verarbeitet u. a. Ihre IP-Adresse und Ihre Eingaben in ' +
            'unser Kontaktformular. Das ist für den Betrieb der Seite nicht erforderlich — ' +
            'ohne Ihre Einwilligung passiert nichts davon.',
      accept: 'Einverstanden',
      decline: 'Nur Notwendiges',
      more: 'Details in der Datenschutzerklärung',
      href: 'Datenschutz.html#cookies'
    },
    en: {
      title: 'Cookies & analytics',
      body: 'We would like to measure how this site is used. For that, the service Venta AI ' +
            'sets a cookie and processes, among other things, your IP address and your entries ' +
            'in our contact form. None of this is required to operate the site — without your ' +
            'consent, none of it happens.',
      accept: 'Accept',
      decline: 'Essential only',
      more: 'Details in the privacy policy',
      href: 'Privacy.html#cookies'
    }
  };

  var CSS =
    '.ar-consent{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;' +
    'display:flex;justify-content:center;padding:16px;pointer-events:none;' +
    'font-family:"Space Grotesk",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
    '.ar-consent__box{pointer-events:auto;max-width:680px;width:100%;' +
    'background:#FFFFFF;color:#1B1428;border:1px solid rgba(27,20,40,.10);' +
    'border-radius:14px;padding:22px 24px;' +
    'box-shadow:0 18px 48px rgba(27,20,40,.16);' +
    'transform:translateY(12px);opacity:0;transition:transform .28s ease,opacity .28s ease}' +
    '.ar-consent--in .ar-consent__box{transform:translateY(0);opacity:1}' +
    '.ar-consent__t{font-size:15px;font-weight:600;letter-spacing:-.01em;margin:0 0 7px;' +
    'display:flex;align-items:center;gap:8px}' +
    '.ar-consent__t::before{content:"//";color:#FF7A6B;font-family:"JetBrains Mono",monospace;' +
    'font-size:12px;font-weight:600}' +
    '.ar-consent__p{font-size:13.5px;line-height:1.6;color:rgba(27,20,40,.72);margin:0 0 16px}' +
    '.ar-consent__a{color:#1B1428;text-decoration:underline;text-underline-offset:2px}' +
    '.ar-consent__a:hover{color:#FF7A6B}' +
    '.ar-consent__row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}' +
    '.ar-consent__btn{font:inherit;font-size:13.5px;font-weight:500;cursor:pointer;' +
    'border-radius:9px;padding:10px 20px;border:1px solid transparent;transition:all .18s ease}' +
    '.ar-consent__btn:focus-visible{outline:2px solid #FF7A6B;outline-offset:2px}' +
    '.ar-consent__btn--yes{background:#1B1428;color:#FBF6EE}' +
    '.ar-consent__btn--yes:hover{background:#3D2B5C}' +
    '.ar-consent__btn--no{background:transparent;color:#1B1428;border-color:rgba(27,20,40,.22)}' +
    '.ar-consent__btn--no:hover{border-color:#1B1428;background:rgba(27,20,40,.04)}' +
    '@media(max-width:520px){.ar-consent{padding:10px}.ar-consent__box{padding:18px}' +
    '.ar-consent__btn{flex:1 1 auto;text-align:center}}' +
    '@media(prefers-reduced-motion:reduce){.ar-consent__box{transition:none;' +
    'transform:none;opacity:1}}';

  // ---------------------------------------------------------------- storage

  function readDecision() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || d.v !== POLICY_VERSION) return null;
      return d.state === 'granted' || d.state === 'denied' ? d.state : null;
    } catch (e) { return null; }
  }

  function writeDecision(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        v: POLICY_VERSION, state: state, ts: new Date().toISOString()
      }));
    } catch (e) {}
  }

  function hasPrefix(name, prefixes) {
    for (var i = 0; i < prefixes.length; i++) {
      if (name.indexOf(prefixes[i]) === 0) return true;
    }
    return false;
  }

  // Entfernt alles, was Venta gesetzt haben kann — auch auf der Parent-Domain,
  // da das Cookie auf `.agentic-reach.com` gesetzt wird.
  function clearVentaData() {
    try {
      var domains = ['', location.hostname, '.' + location.hostname];
      var parts = location.hostname.split('.');
      if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));

      document.cookie.split(';').forEach(function (c) {
        var name = c.split('=')[0].trim();
        if (!name || !hasPrefix(name, VENTA_COOKIE_PREFIXES)) return;
        domains.forEach(function (d) {
          document.cookie = name + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT' +
            (d ? '; domain=' + d : '');
        });
      });
    } catch (e) {}

    [
      { s: window.localStorage, p: VENTA_STORAGE_PREFIXES },
      { s: window.sessionStorage, p: VENTA_STORAGE_PREFIXES }
    ].forEach(function (t) {
      try {
        Object.keys(t.s).forEach(function (k) {
          if (hasPrefix(k, t.p)) t.s.removeItem(k);
        });
      } catch (e) {}
    });
  }

  // ---------------------------------------------------------------- loader

  var loaded = false;

  // Original-Loader von Venta, unverändert übernommen — bootstrappt nur dann,
  // wenn wir ihn aufrufen.
  function loadVenta() {
    if (loaded || window.Venta && window.Venta._loaded) return;
    loaded = true;
    !function(e){"use strict";var a=e&&e.namespace;if(a&&e.profileId&&e.cdn){var r=window[a];if(r&&Array.isArray(r)||(r=window[a]=[]),!r.initialized&&!r._loaded)if(r._loaded)console&&console.warn("[Radar] Duplicate initialization attempted");else{r._loaded=!0;["track","page","identify","group","alias","ready","debug","on","off","once","trackClick","trackSubmit","trackLink","trackForm","pageview","screen","reset","register","setAnonymousId","addSourceMiddleware","addIntegrationMiddleware","addDestinationMiddleware"].forEach((function(e){var i;r[e]=(i=e,function(){var e=window[a];if(e.initialized)return e[i].apply(e,arguments);var r=[].slice.call(arguments);return r.unshift(i),e.push(r),e})})),r.bootstrap=function(){var a=document.createElement("script");a.async=!0,a.type="text/javascript",a.id="__radar__",a.dataset.settings=JSON.stringify(e),a.src="https://"+e.cdn+"/releases/latest/radar.min.js";var r=document.scripts[0];r.parentNode.insertBefore(a,r)},r.bootstrap()}}else"undefined"!=typeof console&&console.error("[Radar] Configuration incomplete")}(VENTA_SETTINGS);
  }

  // ---------------------------------------------------------------- banner

  var el = null;

  function t() {
    var lang = window.ARLang && window.ARLang.get() === 'en' ? 'en' : 'de';
    return TEXT[lang];
  }

  function hide() {
    if (!el) return;
    var node = el;
    el = null;
    node.classList.remove('ar-consent--in');
    setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 300);
  }

  function show() {
    if (el) return;
    var c = t();

    if (!document.getElementById('ar-consent-css')) {
      var style = document.createElement('style');
      style.id = 'ar-consent-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    el = document.createElement('div');
    el.className = 'ar-consent';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'false');
    el.setAttribute('aria-labelledby', 'ar-consent-title');

    var box = document.createElement('div');
    box.className = 'ar-consent__box';

    var h = document.createElement('p');
    h.className = 'ar-consent__t';
    h.id = 'ar-consent-title';
    h.textContent = c.title;

    var p = document.createElement('p');
    p.className = 'ar-consent__p';
    p.appendChild(document.createTextNode(c.body + ' '));

    var a = document.createElement('a');
    a.className = 'ar-consent__a';
    a.href = window.ARLang && window.ARLang.withLang ? window.ARLang.withLang(c.href) : c.href;
    a.textContent = c.more;
    p.appendChild(a);

    var row = document.createElement('div');
    row.className = 'ar-consent__row';

    var yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'ar-consent__btn ar-consent__btn--yes';
    yes.textContent = c.accept;
    yes.addEventListener('click', grant);

    var no = document.createElement('button');
    no.type = 'button';
    no.className = 'ar-consent__btn ar-consent__btn--no';
    no.textContent = c.decline;
    no.addEventListener('click', deny);

    // Ablehnen zuerst im DOM: gleichwertige Gestaltung, keine Bevorzugung
    // der Zustimmung durch Fokusreihenfolge.
    row.appendChild(no);
    row.appendChild(yes);

    box.appendChild(h);
    box.appendChild(p);
    box.appendChild(row);
    el.appendChild(box);
    document.body.appendChild(el);

    requestAnimationFrame(function () {
      if (el) el.classList.add('ar-consent--in');
    });
  }

  function emit(state) {
    window.dispatchEvent(new CustomEvent('ar:consentchange', { detail: { state: state } }));
  }

  // ---------------------------------------------------------------- actions

  function grant() {
    writeDecision('granted');
    hide();
    loadVenta();
    emit('granted');
  }

  function deny() {
    writeDecision('denied');
    hide();
    clearVentaData();
    emit('denied');
  }

  function revoke() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    clearVentaData();
    emit(null);
    // Bereits geladenes Skript lässt sich nicht zurücknehmen — Reload sorgt
    // für einen sauberen Zustand ohne Venta.
    if (loaded) location.reload();
    else show();
  }

  window.ARConsent = {
    get: readDecision,
    grant: grant,
    deny: deny,
    revoke: revoke,
    open: show
  };

  // ---------------------------------------------------------------- init

  function init() {
    // „Cookie-Einstellungen"-Trigger auf allen Seiten verdrahten.
    var triggers = document.querySelectorAll('[data-consent-open]');
    for (var i = 0; i < triggers.length; i++) {
      triggers[i].addEventListener('click', function (ev) {
        ev.preventDefault();
        revoke();
      });
    }

    var decision = readDecision();
    if (decision === 'granted') {
      loadVenta();
      return;
    }

    // Ohne Einwilligung dürfen keine Einträge von Venta bestehen bleiben.
    // Muss hier (nach dem Reload) passieren und nicht schon beim Widerruf:
    // Venta schreibt Session und Geräte-Kennung im unload-Handler zurück,
    // ein Aufräumen vor `location.reload()` würde dadurch überschrieben.
    clearVentaData();

    if (decision !== 'denied') show();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Banner-Texte bei Sprachwechsel neu aufbauen.
  window.addEventListener('ar:langchange', function () {
    if (el) { var node = el; el = null; node.parentNode && node.parentNode.removeChild(node); show(); }
  });
})();
