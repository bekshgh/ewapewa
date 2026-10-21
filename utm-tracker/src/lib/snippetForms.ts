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
  //    Multi-step forms built with React & co. (one <form>, steps swapped inside it,
  //    "Continue" buttons) are followed too: new steps' questions are picked up as they
  //    appear, a step's "Continue" is not a send, and the send counts as successful once
  //    the form gives way to a thank-you screen — or when the page calls
  //    window.tlFormSuccess() / fires a "trackline:success" event.
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
    // the page a form is on, read when the form appears: single-page sites change the address without a reload
    function pageKey() { return (location.hostname.replace(/^www\./, "") + location.pathname.replace(/\/+$/, "")).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_"); }

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
    // A custom dropdown (React & co.): a hidden input holds the answer, a button shows it.
    function controlOf(form, el) {
      var c = null;
      try { c = form.querySelector("#" + (window.CSS && CSS.escape ? CSS.escape(el.name) : el.name)); } catch (e) {}
      if (c && c !== el && (c.tagName === "BUTTON" || /combobox|listbox/.test(c.getAttribute("role") || ""))) return c;
      var p = el.parentNode;
      return (p && p.querySelector && p.querySelector('[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="true"]')) || null;
    }
    // into: the field list found so far (multi-step forms grow it), or a new one
    function fieldsOf(form, into) {
      var fl = into || { list: [], byName: {}, byCtl: {}, used: {} };
      var list = fl.list, byName = fl.byName, used = fl.used;
      fl.added = 0;
      var els = form.querySelectorAll("input, select, textarea");
      for (var i = 0; i < els.length; i++) {
        var el = els[i], n = el.name, t = String(el.type || "").toLowerCase();
        if (!n || SKIP_NAME.test(n)) continue;
        var ctl = t === "hidden" && !/phonemask/.test(el.className) ? controlOf(form, el) : null;
        if (byName[n]) {
          // re-rendered by the page: follow the new elements
          byName[n].group = groupOf(ctl || el) || byName[n].group;
          if (ctl && ctl.id) fl.byCtl[ctl.id] = byName[n];
          continue;
        }
        // Tilda's phone mask keeps the number in a hidden input
        if (SKIP_TYPE.test(t) && !(t === "hidden" && (/phonemask/.test(el.className) || ctl))) continue;
        var key = n.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
        if (!/[A-Za-z0-9]/.test(key)) key = "q" + (list.length + 1);
        var base = key, j = 2;
        while (used[key]) key = base.slice(0, 36) + "_" + j++;
        used[key] = 1;
        var g = groupOf(ctl || el);
        var reqEl = g && g.querySelector('[data-tilda-req="1"]');
        var f = {
          k: key, name: n, group: g, custom: !!ctl,
          kind: el.tagName === "SELECT" || t === "radio" || ctl ? "select" : t === "checkbox" ? "check" : "text",
          req: !!(el.required || el.getAttribute("data-tilda-req") === "1" || el.getAttribute("aria-required") === "true" || reqEl
            || (ctl && ctl.getAttribute("aria-required") === "true")),
          rule: el.getAttribute("data-tilda-rule") || (g && g.querySelector("[data-tilda-rule]") ? g.querySelector("[data-tilda-rule]").getAttribute("data-tilda-rule") : "") || (t === "email" ? "email" : t === "tel" ? "phone" : ""),
          label: labelOf(ctl || el, g)
        };
        if (ctl && ctl.id) fl.byCtl[ctl.id] = f;
        byName[n] = f;
        list.push(f);
        fl.added++;
        if (list.length >= 60) break;
      }
      return fl;
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
      var c = el.closest("[id]");
      if (c && t.form.contains(c) && t.byCtl[c.id]) return t.byCtl[c.id];
      var g = el.closest(".t-input-group");
      var named = g && g.querySelector("[name]");
      return named && t.byName[named.name] ? t.byName[named.name] : null;
    }
    // a question of an earlier step (no longer on the page) keeps what it was when it was left
    function filledKeys(t) {
      var out = [];
      for (var i = 0; i < t.list.length; i++) {
        var f = t.list[i];
        if (elsOf(t, f).length ? stateOf(t, f).filled : t.known[f.k]) out.push(f.k);
      }
      return out;
    }
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
      // a form that may have steps (any non-Tilda one): this visit may not have seen every step, so the
      // tracker adds to the field list instead of replacing it — a visitor who left on step 1 must not
      // erase the questions of steps 2 and 3
      if (t.multi || !t.tilda) c.steps = true;
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
      try { var bad = t.form.querySelectorAll(':invalid, [aria-invalid="true"]'); for (i = 0; i < bad.length; i++) { f = fieldOf(t, bad[i]); if (f && out.indexOf(f) < 0) out.push(f); } } catch (e) {}
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
      // the lead, once the send went through (repeats are merged on the server)
      if (window.tlConversion) window.tlConversion(t.form, true);
    }
    // a non-Tilda form gave way to its thank-you screen, or lost all its questions
    function goneAway(t) {
      if (!document.documentElement.contains(t.form)) return true;
      var els = t.form.querySelectorAll("input, select, textarea");
      for (var i = 0; i < els.length; i++) if (els[i].type !== "hidden" && els[i].offsetParent !== null) return false;
      return true;
    }
    // the questions on screen now (a step's "Continue" changes them)
    function shownSig(t) {
      var out = [], els = t.form.querySelectorAll("[name]");
      for (var i = 0; i < els.length; i++) if (els[i].type === "hidden" || els[i].offsetParent !== null) out.push(els[i].name);
      return out.join("|");
    }
    var STEP = /(continue|next|далее|дальше|продолжить|вперёд|вперед|келесі|жалғастыру)/i;
    var SEND = /(submit|send|apply|finish|отправ|подать|завершить|зарегистр|жіберу|тапсыру)/i;
    function isStep(t, b) {
      if (t.tilda || !b) return false;
      var x = txt(b) || b.value || b.getAttribute("aria-label") || "";
      return STEP.test(x) && !SEND.test(x);
    }
    // a step's "Continue" is not a send: only report the questions it stopped on
    function stepAttempt(t) {
      var now = Date.now();
      if (now - t.attemptAt < 1000) return;
      t.attemptAt = now;
      var before = shownSig(t);
      setTimeout(function () {
        if (t.attemptAt !== now || shownSig(t) !== before) return; // moved on to the next step
        var missing = errorsShown(t);
        if (missing.length) start(t, null);
        missing.forEach(function (f) { emit(t, "field_error", f, { error: stateOf(t, f).filled ? "invalid" : "required", on: "step" }); });
      }, 700);
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
        if (!t.tilda && goneAway(t)) return sent(t);
        var missing = errorsShown(t);
        if (missing.length) {
          missing.forEach(function (f) { emit(t, "field_error", f, { error: stateOf(t, f).filled ? "invalid" : "required", on: "submit" }); });
          emit(t, "submit_blocked", null, { missing: missing.map(function (f) { return f.k; }) });
          return;
        }
        // no errors: wait for Tilda's success message (the event below usually comes first),
        // or for a non-Tilda form to give way to its thank-you screen
        var tries = 0, poll = setInterval(function () {
          if (t.done || t.attemptAt !== now || ++tries > 60) return clearInterval(poll);
          if (t.tilda ? successShown(t) : goneAway(t)) { clearInterval(poll); sent(t); }
        }, 500);
      }, 700);
    }
    function trackerOf(el) { for (var i = 0; i < trackers.length; i++) if (trackers[i].form === el || trackers[i].form.contains(el)) return trackers[i]; return null; }
    document.addEventListener("tildaform:aftersuccess", function (e) { var t = trackerOf(e.target); if (t) sent(t); }, true);
    // For pages that know best: window.tlFormSuccess(form) or a "trackline:success" event after the send.
    function successFrom(target) {
      var t = target && target.nodeType === 1 ? trackerOf(target) : null, i;
      for (i = trackers.length - 1; !t && i >= 0; i--) if (!trackers[i].done && trackers[i].attemptAt) t = trackers[i];
      for (i = trackers.length - 1; !t && i >= 0; i--) if (!trackers[i].done && trackers[i].started) t = trackers[i];
      if (!t || t.done) return;
      if (!t.attemptAt) emit(t, "submit_attempt", null, { filled: filledKeys(t) });
      sent(t);
    }
    window.tlFormSuccess = function (form) { try { successFrom(form); } catch (e) {} };
    document.addEventListener("trackline:success", function (e) { successFrom(e.target); }, true);

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
      var t = { form: form, id: pageKey().slice(0, 79 - ident.length) + ":" + ident, fl: fl, list: fl.list, byName: fl.byName, byCtl: fl.byCtl, title: titleOf(form),
                tilda: /(^|\s)t-form(\s|$)/.test(form.className) || !!form.closest(".t-rec, .t-popup"), multi: false,
                q: [], sid: "", seq: 0, t0: 0, started: false, done: false, last: null, focusAt: {}, seen: {}, attemptAt: 0, values: {}, known: {} };
      customValues(t, false);
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
        t.known[f.k] = s.filled;
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
      form.addEventListener("submit", function (e) {
        var b = e.submitter || (form.contains(document.activeElement) ? document.activeElement : null);
        if (isStep(t, b)) stepAttempt(t); else attempt(t);
      }, true);
      form.addEventListener("click", function (e) {
        var b = e.target && e.target.closest && e.target.closest('.t-submit, button[type="submit"], input[type="submit"]');
        if (!b || !form.contains(b)) return;
        if (isStep(t, b)) stepAttempt(t); else attempt(t);
      }, true);
      // the steps of a multi-step form: new questions appear inside the same <form>
      if (!t.tilda && "MutationObserver" in window) {
        var pending = 0;
        new MutationObserver(function () {
          if (pending) return;
          pending = setTimeout(function () {
            pending = 0;
            fieldsOf(form, t.fl);
            if (t.fl.added) t.multi = true;
          }, 150);
        }).observe(form, { childList: true, subtree: true });
      }
    }
    // Custom dropdowns change a hidden input without a "change" event: compare after clicks and keys.
    function customValues(t, report) {
      for (var i = 0; i < t.list.length; i++) {
        var f = t.list[i];
        if (!f.custom || !elsOf(t, f).length) continue; // its step is not on the page: the answer stays
        var s = stateOf(t, f), v = String(s.value);
        t.known[f.k] = s.filled;
        if (report && t.values[f.k] !== v && (s.filled || t.values[f.k])) {
          start(t, f);
          t.last = f;
          emit(t, "field_change", f, { value: v.slice(0, 40), filled: s.filled });
        }
        t.values[f.k] = v;
      }
    }
    function checkCustom() {
      setTimeout(function () { for (var i = 0; i < trackers.length; i++) if (!trackers[i].tilda && !trackers[i].done) customValues(trackers[i], true); }, 150);
    }
    document.addEventListener("click", checkCustom, true);
    document.addEventListener("keyup", checkCustom, true);
    function scan() {
      try { var fs = document.querySelectorAll("form"); for (var i = 0; i < fs.length; i++) track(fs[i], i); } catch (e) {}
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan); else scan();
    window.addEventListener("load", scan);
    setTimeout(scan, 2000);
    // forms rendered later (single-page apps)
    if ("MutationObserver" in window) {
      var scanTimer = 0;
      new MutationObserver(function () { if (!scanTimer) scanTimer = setTimeout(function () { scanTimer = 0; scan(); }, 500); })
        .observe(document.documentElement, { childList: true, subtree: true });
    }

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
