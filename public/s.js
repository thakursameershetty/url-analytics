/*!
 * On-site analytics snippet for the URL shortener.
 *
 *   <script defer src="https://YOUR-SHORTENER/s.js" data-site="site_xxx"></script>
 *
 * Records page views, clicks (with the element that was clicked), scroll depth,
 * rage clicks and dead clicks, and links the page view to the short-link click
 * that brought the visitor here. Form fields are never read. Respects Do Not Track.
 */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script || window.__snipAnalytics) return;
  window.__snipAnalytics = true;

  var SITE = script.getAttribute('data-site');
  if (!SITE || navigator.webdriver && !script.hasAttribute('data-allow-automation')) return;
  if ((navigator.doNotTrack === '1' || window.doNotTrack === '1') && script.getAttribute('data-dnt') !== 'ignore') return;

  var BASE = new URL(script.src, location.href).origin;
  var COLLECT = BASE + '/api/collect';
  var FLUSH_MS = 5000;
  var MAX_EVENTS = 200;

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  function store(kind, key, value) {
    try {
      var s = kind === 'local' ? localStorage : sessionStorage;
      if (value === undefined) return s.getItem(key);
      s.setItem(key, value);
    } catch (e) {}
    return value;
  }

  var visitorId = store('local', 'snip_vid') || store('local', 'snip_vid', uid());

  // The shortener appends ?snip_v=<slug>.<visitId>; keep it for this tab, then hide it from the URL.
  var params = new URLSearchParams(location.search);
  var fromLink = params.get('snip_v');
  if (fromLink) {
    store('session', 'snip_v', fromLink);
    params.delete('snip_v');
    try {
      var clean = location.pathname + (params.toString() ? '?' + params : '') + location.hash;
      history.replaceState(history.state, '', clean);
    } catch (e) {}
  }
  var visitRef = fromLink || store('session', 'snip_v');

  var page; // the current page view
  function docHeight() {
    var b = document.body, e = document.documentElement;
    return Math.max(b ? b.scrollHeight : 0, e.scrollHeight, e.offsetHeight);
  }
  function startPage() {
    page = {
      id: uid(),
      started: Date.now(),
      lastActive: Date.now(),
      activeMs: 0,
      maxScroll: Math.round(scrollY + innerHeight),
      events: [],
      sentInit: false,
      snapshotSent: false,
    };
  }

  // ---- Active time: only count while the tab is visible and the user did something recently.
  function tick() {
    var now = Date.now();
    if (document.visibilityState === 'visible' && now - page.lastActive < 30000) {
      page.activeMs += Math.min(now - (page.tickAt || now), 5000);
    }
    page.tickAt = now;
  }
  function touch() {
    page.lastActive = Date.now();
  }

  // ---- Element description: a short CSS path that survives small layout changes.
  function cssPath(el) {
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.documentElement && parts.length < 6) {
      var tag = el.tagName.toLowerCase();
      if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) {
        parts.unshift(tag + '#' + el.id);
        break;
      }
      var part = tag;
      var parent = el.parentElement;
      if (parent) {
        var same = 0, index = 0;
        for (var i = 0; i < parent.children.length; i++) {
          if (parent.children[i].tagName === el.tagName) {
            same++;
            if (parent.children[i] === el) index = same;
          }
        }
        if (same > 1) part += ':nth-of-type(' + index + ')';
      }
      parts.unshift(part);
      el = parent;
    }
    return parts.join(' > ') || el.tagName.toLowerCase();
  }
  var INTERACTIVE = 'a,button,input,select,textarea,label,summary,details,[role="button"],[role="link"],[role="tab"],[onclick],[contenteditable=""],[contenteditable="true"],[tabindex]';
  function labelOf(el) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return null; // never read form values
    // Big containers (sections, wrappers) would "label" a click with half the page's text.
    if (/^(HTML|BODY|MAIN|SECTION|ARTICLE|HEADER|FOOTER)$/.test(el.tagName) || el.children.length > 3) {
      return el.getAttribute('aria-label') || null;
    }
    var t = (el.getAttribute('aria-label') || el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    return t ? t.slice(0, 80) : null;
  }

  // ---- Clicks, rage clicks and dead clicks.
  var mutations = 0;
  if (window.MutationObserver) {
    new MutationObserver(function () { mutations++; }).observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, characterData: true,
    });
  }
  var recent = [];
  function push(ev) {
    if (page.events.length < MAX_EVENTS) page.events.push(ev);
  }
  document.addEventListener('click', function (e) {
    touch();
    var el = e.target && e.target.nodeType === 1 ? e.target : e.target && e.target.parentElement;
    if (!el) return;
    var target = el.closest(INTERACTIVE) || el;
    var r = target.getBoundingClientRect();
    var ev = {
      type: 'click',
      t: Date.now() - page.started,
      x: Math.round(e.pageX),
      y: Math.round(e.pageY),
      sel: cssPath(target),
      ox: r.width ? +((e.clientX - r.left) / r.width).toFixed(3) : 0.5,
      oy: r.height ? +((e.clientY - r.top) / r.height).toFixed(3) : 0.5,
      tag: target.tagName.toLowerCase(),
      text: labelOf(target),
    };
    push(ev);

    // Rage: 3+ clicks within 700ms inside a 32px radius.
    var now = Date.now();
    recent = recent.filter(function (c) { return now - c.at < 700; });
    recent.push({ at: now, x: e.clientX, y: e.clientY, ev: ev });
    var near = recent.filter(function (c) { return Math.abs(c.x - e.clientX) < 32 && Math.abs(c.y - e.clientY) < 32; });
    if (near.length >= 3) near.forEach(function (c) { c.ev.type = 'rage'; });

    // Dead: clicked something that isn't interactive and nothing on the page changed.
    if (!el.closest(INTERACTIVE)) {
      var before = mutations, href = location.href;
      setTimeout(function () {
        if (ev.type === 'click' && mutations === before && location.href === href) ev.type = 'dead';
      }, 600);
    }
  }, true);

  // ---- Scroll depth (bottom edge of the viewport, in page pixels).
  addEventListener('scroll', function () {
    touch();
    var bottom = Math.round(scrollY + innerHeight);
    if (bottom > page.maxScroll) page.maxScroll = bottom;
  }, { passive: true });
  ['mousemove', 'keydown', 'touchstart'].forEach(function (t) {
    addEventListener(t, touch, { passive: true, capture: true });
  });

  // ---- Sending.
  function payload(final) {
    tick();
    // Events from the last 600ms may still become "dead"; hold them back unless the page is closing.
    var cutoff = final ? Infinity : Date.now() - page.started - 650;
    var ready = page.events.filter(function (e) { return e.t <= cutoff; });
    page.events = page.events.filter(function (e) { return e.t > cutoff; });
    var body = {
      k: SITE,
      s: page.id,
      vid: visitorId,
      v: visitRef || undefined,
      u: location.href,
      w: innerWidth,
      h: innerHeight,
      dh: docHeight(),
      ms: page.maxScroll,
      a: page.activeMs,
      ev: ready,
    };
    if (!page.sentInit) {
      body.init = 1;
      body.r = document.referrer || undefined;
    }
    return body;
  }
  function send(final) {
    var body = payload(final);
    // Skip idle heartbeats: nothing clicked, no deeper scroll, no new active time.
    var sig = body.ms + '|' + Math.floor(body.a / 5000);
    if (page.sentInit && !body.ev.length && !final && sig === page.lastSig) return;
    page.lastSig = sig;
    page.sentInit = true;
    var json = JSON.stringify(body);
    // text/plain keeps this a "simple" request: no CORS preflight.
    if (final && navigator.sendBeacon) {
      navigator.sendBeacon(COLLECT, new Blob([json], { type: 'text/plain' }));
      return;
    }
    fetch(COLLECT, { method: 'POST', body: json, keepalive: true, headers: { 'Content-Type': 'text/plain' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (res) { if (res && res.snapshot && !page.snapshotSent) sendSnapshot(); })
      .catch(function () {});
  }

  // ---- Page snapshot: script-free HTML used as the heatmap backdrop.
  function canvasImage(canvas) {
    try {
      if (!canvas.width || !canvas.height) return null;
      var r = canvas.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return null;
      // Downscale big canvases; WebP keeps transparency and stays small.
      var k = Math.min(1, 1600 / canvas.width);
      var out = document.createElement('canvas');
      out.width = Math.round(canvas.width * k);
      out.height = Math.round(canvas.height * k);
      var ctx = out.getContext('2d');
      ctx.drawImage(canvas, 0, 0, out.width, out.height);
      // Skip fully transparent canvases (effects that haven't drawn anything yet).
      var px = ctx.getImageData(0, 0, out.width, out.height).data, seen = false;
      for (var i = 3; i < px.length; i += 4 * 97) { if (px[i] > 8) { seen = true; break; } }
      if (!seen) return null;
      return out.toDataURL('image/webp', 0.75);
    } catch (e) {
      return null; // cross-origin (tainted) canvas
    }
  }

  function sendSnapshot() {
    page.snapshotSent = true;
    var run = function () {
      try {
        var root = document.documentElement.cloneNode(true);
        // Canvas pixels aren't part of the HTML: embed non-empty canvases as images, drop empty ones.
        var liveCanvases = document.querySelectorAll('canvas');
        var copyCanvases = root.querySelectorAll('canvas');
        for (var c = 0; c < liveCanvases.length && c < copyCanvases.length; c++) {
          var src = canvasImage(liveCanvases[c]);
          var copy = copyCanvases[c];
          if (!src) { copy.remove(); continue; }
          var img = document.createElement('img');
          ['class', 'style', 'id', 'aria-hidden'].forEach(function (a) {
            if (copy.hasAttribute(a)) img.setAttribute(a, copy.getAttribute(a));
          });
          var cr = liveCanvases[c].getBoundingClientRect();
          img.style.width = cr.width + 'px';
          img.style.height = cr.height + 'px';
          img.alt = '';
          img.src = src;
          copy.replaceWith(img);
        }
        root.querySelectorAll('script,noscript,iframe,object,embed,template').forEach(function (n) { n.remove(); });
        // Strip anything the visitor typed; drop inline event handlers.
        root.querySelectorAll('input,textarea,select,option').forEach(function (n) {
          n.removeAttribute('value');
          n.removeAttribute('checked');
          n.removeAttribute('selected');
          if (n.tagName === 'TEXTAREA') n.textContent = '';
        });
        root.querySelectorAll('*').forEach(function (n) {
          for (var i = n.attributes.length - 1; i >= 0; i--) {
            if (/^on/i.test(n.attributes[i].name)) n.removeAttribute(n.attributes[i].name);
          }
        });
        // Styles injected through the CSSOM (CSS-in-JS) don't appear in the HTML; copy them in.
        var live = document.querySelectorAll('style');
        var copies = root.querySelectorAll('style');
        for (var i = 0; i < live.length && i < copies.length; i++) {
          try {
            var rules = live[i].sheet && live[i].sheet.cssRules;
            if (rules && rules.length && !live[i].textContent.trim()) {
              copies[i].textContent = Array.prototype.map.call(rules, function (r) { return r.cssText; }).join('\n');
            }
          } catch (e) {}
        }
        // Lazy images: make sure the real source is used.
        root.querySelectorAll('img[loading="lazy"]').forEach(function (n) { n.removeAttribute('loading'); });
        var head = root.querySelector('head');
        if (head) {
          var base = document.createElement('base');
          base.href = location.href;
          head.insertBefore(base, head.firstChild);
        }
        var html = '<!DOCTYPE html>' + root.outerHTML;
        if (html.length > 8000000) return;
        fetch(COLLECT + '/snapshot', {
          method: 'POST',
          keepalive: false,
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ k: SITE, u: location.href, w: innerWidth, h: innerHeight, dh: docHeight(), html: html }),
        }).catch(function () {});
      } catch (e) {}
    };
    // Wait for intro animations, late images and layout to settle so the copy matches what
    // people actually see. Override with data-snapshot-delay="ms" on the script tag.
    var delay = parseInt(script.getAttribute('data-snapshot-delay'), 10);
    if (!(delay >= 0)) delay = 4000;
    var later = function () {
      setTimeout(function () {
        // Skip if the visitor already left the tab; the next visit will capture it.
        if (document.visibilityState === 'visible') run();
        else page.snapshotSent = false;
      }, delay);
    };
    if (document.readyState === 'complete') later();
    else addEventListener('load', later);
  }

  startPage();
  setTimeout(function () { send(false); }, 300);
  setInterval(function () { send(false); }, FLUSH_MS);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') send(true);
    else touch();
  });
  addEventListener('pagehide', function () { send(true); });

  // ---- Single-page apps: treat client-side navigations as new page views.
  var lastPath = location.pathname;
  function onRoute() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    send(true);
    startPage();
    setTimeout(function () { send(false); }, 300);
  }
  ['pushState', 'replaceState'].forEach(function (m) {
    var orig = history[m];
    history[m] = function () {
      var r = orig.apply(this, arguments);
      setTimeout(onRoute, 0);
      return r;
    };
  });
  addEventListener('popstate', onRoute);
})();
