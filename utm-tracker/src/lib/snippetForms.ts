/**
 * Part 3 of /t.js: drop-off analytics for every form on the page (Forms in
 * the tracker). Pasted into buildSnippetJs, so it runs in the snippet's scope
 * (TRACKER, val). String.raw keeps the regex backslashes as they are.
 */
export const FORMS_JS = String.raw`
  // 3. Form analytics (Forms in the tracker), for every form on the page: which
  //    questions people reach, fill, get stuck on and leave on. Anonymous: only
  //    whether a field is filled, never what was typed; select / tick answers go
  //    as categories. The project is worked out by the tracker from the page's
  //    links. The TopTalents.Sprint landing (#tt) has its own analytics and is
  //    skipped. ?tt_debug=1 marks the visit as a test and logs events to the console.
  (function () {
    try {
      var DEBUG = /[?&]tt_debug=1(&|$)/.test(location.search);
      var ua = navigator.userAgent || "";
      if (!DEBUG && (navigator.webdriver === true || /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|telegrambot|whatsapp/i.test(ua))) return;
    } catch (e) { return; }
    var COLLECT = TRACKER + "/api/collect", IDLE = 30 * 60 * 1000;
    var SKIP_NAME = /^(click_id|utm_\w+|tildaspec|form-spec|formservices|tildadelivery|g-recaptcha|cf-turnstile|h-captcha)/i;
    var SKIP_TYPE = /^(hidden|submit|button|reset|image|file|password|search)$/;
    function store(k) { try { var s = window[k]; s.getItem("x"); return s; } catch (e) { return null; } }
    var LS = store("localStorage"), SS = store("sessionStorage");
    function get(s, k) { try { return s ? s.getItem(k) : null; } catch (e) { return null; } }
    function put(s, k, v) { try { if (s) s.setItem(k, v); } catch (e) {} }
    function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
    function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }
    function txt(el) { return el ? String(el.textContent || "").replace(/\s+/g, " ").trim() : ""; }
    var vid = get(LS, "tl_vid") || rid();
    put(LS, "tl_vid", vid);
    // one visit = one session per form; a new one after 30 minutes of nothing
    var memSid = "", memLast = 0;
    function baseSid() {
      var now = Date.now(), sid = get(SS, "tl_sid") || memSid, last = +get(SS, "tl_last") || memLast;
      if (!sid || (last && now - last > IDLE)) sid = rid();
      put(SS, "tl_sid", sid); put(SS, "tl_last", String(now));
      memSid = sid; memLast = now;
      return sid;
    }
    function device() {
      var w = window.innerWidth || 0;
      if (/iPad|Tablet/i.test(ua) || (w >= 768 && w < 1024 && /Mobi|Android/i.test(ua))) return "tablet";
      return /Mobi|Android|iPhone/i.test(ua) || w < 768 ? "mobile" : "desktop";
    }
    var page = (location.hostname.replace(/^www\./, "") + location.pathname.replace(/\/+$/, "")).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_");

    // ── the form's questions, in page order ──
    function groupOf(el) { return el.closest(".t-input-group, .t-input-group_cb, .form-group, fieldset"); }
    function labelOf(el, g) {
      var x = txt(g && g.querySelector(".t-input-title, .t-input-name, legend"));
      if (!x && el.id) { try { x = txt(document.querySelector('label[for="' + el.id.replace(/"/g, "") + '"]')); } catch (e) {} }
      if (!x) x = txt(el.closest("label"));
      if (!x && g && g.tagName !== "FIELDSET") x = txt(g.querySelector("label"));
      x = x || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.name;
      return String(x).replace(/\s+/g, " ").trim().slice(0, 100);
    }
    function fieldsOf(form) {
      var list = [], byName = {}, used = {};
      var els = form.querySelectorAll("input, select, textarea");
      for (var i = 0; i < els.length; i++) {
        var el = els[i], n = el.name, t = String(el.type || "").toLowerCase();
        if (!n || byName[n] || SKIP_NAME.test(n)) continue;
        // Tilda's phone mask keeps the number in a hidden input
        if (SKIP_TYPE.test(t) && !(t === "hidden" && /phonemask/.test(el.className))) continue;
        var key = n.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
        if (!/[A-Za-z0-9]/.test(key)) key = "q" + (list.length + 1);
        var base = key, j = 2;
        while (used[key]) key = base.slice(0, 36) + "_" + j++;
        used[key] = 1;
        var g = groupOf(el);
        var reqEl = g && g.querySelector('[data-tilda-req="1"]');
        var f = {
          k: key, name: n, group: g,
          kind: el.tagName === "SELECT" || t === "radio" ? "select" : t === "checkbox" ? "check" : "text",
          req: !!(el.required || el.getAttribute("data-tilda-req") === "1" || el.getAttribute("aria-required") === "true" || reqEl),
          rule: el.getAttribute("data-tilda-rule") || (g && g.querySelector("[data-tilda-rule]") ? g.querySelector("[data-tilda-rule]").getAttribute("data-tilda-rule") : "") || (t === "email" ? "email" : t === "tel" ? "phone" : ""),
          label: labelOf(el, g)
        };
        byName[n] = f;
        list.push(f);
        if (list.length >= 60) break;
      }
      return { list: list, byName: byName };
    }
    function elsOf(t, f) {
      var x = t.form.elements[f.name];
      if (!x) return [];
      return x.tagName ? [x] : Array.prototype.slice.call(x);
    }
    // filled / valid / length — never the text itself
    function stateOf(t, f) {
      var list = elsOf(t, f), filled = false, v = "";
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (e.type === "checkbox" || e.type === "radio") { if (e.checked) { if (!filled) v = e.value; filled = true; } }
        else { var s = String(e.value || "").trim(); if (s) { filled = true; v = s; } }
      }
      if (!filled && f.kind === "text" && f.group) {
        var vis = f.group.querySelectorAll("input:not([type=hidden]), textarea");
        for (var j = 0; j < vis.length; j++) {
          // a phone mask's own characters ("+7 (___) ___-__-__") are not an answer
          var w = String(vis[j].value || "").trim().replace(/^\+\d{1,3}/, "").replace(/[\s_()+-]/g, "");
          if (w) { filled = true; v = String(vis[j].value).trim(); }
        }
      }
      var valid = filled;
      if (filled && f.kind === "text") {
        if (f.rule === "email") valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
        else if (f.rule === "phone") valid = v.replace(/\D/g, "").length >= 7;
      }
      return { filled: filled, valid: valid, len: f.kind === "text" ? v.length : 0, value: f.kind === "text" ? "" : v };
    }
    function fieldOf(t, el) {
      if (!el || !el.closest || !t.form.contains(el)) return null;
      if (el.name && t.byName[el.name]) return t.byName[el.name];
      var g = el.closest(".t-input-group");
      var named = g && g.querySelector("[name]");
      return named && t.byName[named.name] ? t.byName[named.name] : null;
    }
    function filledKeys(t) { var out = []; for (var i = 0; i < t.list.length; i++) if (stateOf(t, t.list[i]).filled) out.push(t.list[i].k); return out; }
    function titleOf(form) {
      var box = form.closest(".t-popup, .t-rec, section");
      var h = box && box.querySelector(".t-popup__title, .t-title, .t-section__title, .t-name, h1, h2, h3");
      return (txt(h) || document.title || "").slice(0, 120);
    }

    // ── sending: per form, in batches, a beacon when the page is left ──
    var trackers = [], timer = 0;
    function ctx(t) {
      var c = {};
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (k) { var v = val(k); if (v) c[k] = v.slice(0, 200); });
      if (val("click_id")) c.click_id = val("click_id").slice(0, 100);
      c.referrer = (document.referrer || "").slice(0, 500);
      c.url = location.href.slice(0, 500);
      c.device = device();
      c.screen = window.screen ? screen.width : 0;
      c.lang = (document.documentElement.lang || navigator.language || "").slice(0, 8);
      c.title = t.title;
      c.fields = t.list.map(function (f) { return { k: f.k, kind: f.kind, req: f.req, label: f.label }; });
      return c;
    }
    function flush(t, beacon) {
      if (!t.q.length) return;
      var batch = t.q.splice(0, 50);
      var body = JSON.stringify({ v: 1, sid: t.sid, vid: vid, form: t.id, test: DEBUG, ctx: ctx(t), events: batch });
      var ok = false;
      // text/plain: a "simple" request, no CORS preflight
      try { if (beacon && navigator.sendBeacon) ok = navigator.sendBeacon(COLLECT, new Blob([body], { type: "text/plain" })); } catch (e) {}
      if (!ok) { try { fetch(COLLECT, { method: "POST", body: body, keepalive: body.length < 60000, credentials: "omit", headers: { "Content-Type": "text/plain" } }).catch(function () {}); } catch (e) {} }
      if (t.q.length) flush(t, beacon);
    }
    function flushAll(beacon) { clearTimeout(timer); timer = 0; for (var i = 0; i < trackers.length; i++) flush(trackers[i], beacon); }
    function session(t) {
      var sid = baseSid() + "f" + hash(t.id);
      if (sid === t.sid) return;
      flush(t, false); // events of the previous session go under its own id
      t.sid = sid;
      t.seq = +get(SS, "tl_q_" + sid) || 0;
      t.t0 = +get(SS, "tl_t_" + sid) || Date.now();
      put(SS, "tl_t_" + sid, String(t.t0));
      t.started = get(SS, "tl_s_" + sid) === "1";
      t.done = false;
    }
    function emit(t, type, f, meta) {
      try {
        session(t);
        t.seq++;
        put(SS, "tl_q_" + t.sid, String(t.seq));
        var now = Date.now(), ev = { id: t.sid + "." + t.seq, t: type, ts: now, o: Math.max(0, now - t.t0) };
        if (f) ev.f = f.k;
        if (meta) ev.m = meta;
        t.q.push(ev);
        if (type === "submit_success") t.done = true;
        if (DEBUG && window.console) console.log("[tl]", t.id, type, f ? f.k : "", meta || "");
        if (t.q.length >= 10) flush(t, false);
        else if (!timer) timer = setTimeout(function () { flushAll(false); }, 3000);
      } catch (e) {}
    }
    function start(t, f) {
      if (t.started) return;
      emit(t, "form_start", f);
      t.started = true;
      put(SS, "tl_s_" + t.sid, "1");
    }

    // ── sending the form: blocked (which questions), or sent ──
    function errorsShown(t) {
      var out = [], i, f;
      var boxes = t.form.querySelectorAll(".js-error-control-box, .t-input-group_error");
      for (i = 0; i < boxes.length; i++) { f = fieldOf(t, boxes[i].querySelector("[name]")); if (f && out.indexOf(f) < 0) out.push(f); }
      var errs = t.form.querySelectorAll(".t-input-error");
      for (i = 0; i < errs.length; i++) if (txt(errs[i])) { f = fieldOf(t, (errs[i].closest(".t-input-group") || errs[i]).querySelector("[name]")); if (f && out.indexOf(f) < 0) out.push(f); }
      try { var bad = t.form.querySelectorAll(":invalid"); for (i = 0; i < bad.length; i++) { f = fieldOf(t, bad[i]); if (f && out.indexOf(f) < 0) out.push(f); } } catch (e) {}
      return out;
    }
    function successShown(t) {
      if (/(^|\s)js-send-form-success(\s|$)/.test(t.form.className)) return true;
      var box = t.form.querySelector(".js-successbox, .t-form__successbox");
      try { return !!(box && txt(box) && getComputedStyle(box).display !== "none"); } catch (e) { return false; }
    }
    function sent(t) {
      if (t.done) return;
      emit(t, "submit_success");
      flush(t, false);
    }
    function attempt(t) {
      var now = Date.now();
      if (now - t.attemptAt < 1000) return; // the button's click and the form's submit come together
      t.attemptAt = now;
      start(t, null);
      emit(t, "submit_attempt", null, { filled: filledKeys(t) });
      t.done = false;
      setTimeout(function () {
        if (t.done || t.attemptAt !== now) return;
        var missing = errorsShown(t);
        if (missing.length) {
          missing.forEach(function (f) { emit(t, "field_error", f, { error: stateOf(t, f).filled ? "invalid" : "required", on: "submit" }); });
          emit(t, "submit_blocked", null, { missing: missing.map(function (f) { return f.k; }) });
          return;
        }
        // no errors: wait for Tilda's success message (the event below usually comes first)
        var tries = 0, poll = setInterval(function () {
          if (t.done || t.attemptAt !== now || ++tries > 60) return clearInterval(poll);
          if (successShown(t)) { clearInterval(poll); sent(t); }
        }, 500);
      }, 700);
    }
    function trackerOf(el) { for (var i = 0; i < trackers.length; i++) if (trackers[i].form === el || trackers[i].form.contains(el)) return trackers[i]; return null; }
    document.addEventListener("tildaform:aftersuccess", function (e) { var t = trackerOf(e.target); if (t) sent(t); }, true);

    function onView(el, fn) {
      if (!("IntersectionObserver" in window)) return fn();
      var io = new IntersectionObserver(function (en) {
        for (var i = 0; i < en.length; i++) if (en[i].isIntersecting) { io.disconnect(); return fn(); }
      }, { rootMargin: "0px 0px -20% 0px" });
      io.observe(el);
    }
    function track(form, i) {
      if (form.__tl || form.id === "ttForm" || form.closest("#tt") || form.getAttribute("role") === "search") return;
      var fl = fieldsOf(form);
      if (!fl.list.length) return;
      form.__tl = true;
      var ident = (form.id || form.getAttribute("name") || "form" + i).replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 30);
      var t = { form: form, id: page.slice(0, 79 - ident.length) + ":" + ident, list: fl.list, byName: fl.byName, title: titleOf(form),
                q: [], sid: "", seq: 0, t0: 0, started: false, done: false, last: null, focusAt: {}, seen: {}, attemptAt: 0 };
      trackers.push(t);
      emit(t, "page_view", null, { path: location.pathname.slice(0, 200) });
      onView(form, function () { emit(t, "form_view"); });
      form.addEventListener("focusin", function (e) {
        var f = fieldOf(t, e.target);
        if (!f || (e.relatedTarget && fieldOf(t, e.relatedTarget) === f)) return;
        start(t, f);
        t.seen[f.k] = (t.seen[f.k] || 0) + 1;
        t.focusAt[f.k] = Date.now();
        t.last = f;
        emit(t, "field_focus", f, { n: t.seen[f.k] });
      });
      form.addEventListener("focusout", function (e) {
        var f = fieldOf(t, e.target);
        // moving inside one question (phone code → number, one option → another) is not leaving it
        if (!f || (e.relatedTarget && fieldOf(t, e.relatedTarget) === f)) return;
        var s = stateOf(t, f), m = { filled: s.filled, valid: s.valid, dur: t.focusAt[f.k] ? Date.now() - t.focusAt[f.k] : 0 };
        if (f.kind === "text") m.len = s.len;
        delete t.focusAt[f.k];
        emit(t, "field_blur", f, m);
        if (s.filled && !s.valid) emit(t, "field_error", f, { error: "invalid", on: "blur" });
      });
      form.addEventListener("change", function (e) {
        var f = fieldOf(t, e.target);
        if (!f) return;
        start(t, f);
        if (f.kind === "text") return;
        t.last = f;
        var s = stateOf(t, f);
        emit(t, "field_change", f, { value: f.kind === "check" ? (e.target.checked ? "yes" : "no") : String(s.value).slice(0, 40), filled: s.filled });
      });
      form.addEventListener("submit", function () { attempt(t); }, true);
      form.addEventListener("click", function (e) {
        var b = e.target && e.target.closest && e.target.closest('.t-submit, button[type="submit"], input[type="submit"]');
        if (b && form.contains(b)) attempt(t);
      }, true);
    }
    function scan() {
      try { var fs = document.querySelectorAll("form"); for (var i = 0; i < fs.length; i++) track(fs[i], i); } catch (e) {}
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan); else scan();
    window.addEventListener("load", scan);
    setTimeout(scan, 2000);

    // leaving: a summary for forms not sent, then everything still queued
    var left = false;
    function leave() {
      for (var i = 0; i < trackers.length; i++) {
        var t = trackers[i];
        if (!left && !t.done) emit(t, "abandon", t.last, { filled: filledKeys(t), elapsed: Date.now() - t.t0, started: t.started });
      }
      left = true;
      flushAll(true);
    }
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") leave(); else left = false; });
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", function () { left = false; });
  })();
`;
