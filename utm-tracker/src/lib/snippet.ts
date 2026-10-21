import { FORMS_JS } from "@/lib/snippetForms";

/**
 * The on-page tracking script, served from /t.js. Pages include it with a
 * single <script src> tag, so fixes here reach every page on the next deploy
 * without re-pasting anything on Tilda.
 */
export function buildSnippetJs(base: string): string {
  return `// Trackline — one script does three jobs:
//   1. copy click_id + UTM from the URL into hidden fields of every form;
//   2. report a lead (with name / email / phone from the form) when the submit
//      button ("Отправить заявку") is pressed, so leads are counted even
//      without a server-side webhook;
//   3. form analytics: where people drop off in every form on the page.
(function () {
  if (window.__trackline) return;
  window.__trackline = true;
  var TRACKER = "${base}";
  var FIELDS = ["click_id","utm_source","utm_medium","utm_campaign","utm_content","utm_term"];
  var p = new URLSearchParams(window.location.search);

  // Persist the params to a cookie so they survive a redirect to a thank-you page.
  // A visit with any of them replaces the whole set: tags of an earlier visit must
  // never mix into this one (utm_content of yesterday's QR on today's Instagram click).
  if (FIELDS.some(function (name) { return p.get(name); })) {
    FIELDS.forEach(function (name) {
      var v = p.get(name);
      try {
        document.cookie = "tl_" + name + "=" + (v ? encodeURIComponent(v) + ";max-age=86400" : ";max-age=0") + ";path=/;SameSite=Lax";
      } catch (e) {}
    });
  }
  function cookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )tl_" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }
  function val(name) { return p.get(name) || cookie(name) || ""; }

  // 1. Fill hidden fields.
  function fill() {
    document.querySelectorAll("form").forEach(function (form) {
      FIELDS.forEach(function (name) {
        var v = val(name);
        if (!v) return;
        var input = form.querySelector('input[name="' + name + '"]');
        if (!input) { input = document.createElement("input"); input.type = "hidden"; input.name = name; form.appendChild(input); }
        input.value = v;
      });
    });
  }
  fill();
  window.addEventListener("load", fill);
  setTimeout(fill, 1500);

  function send(path, data) {
    var url = TRACKER + path;
    var json = JSON.stringify(data);
    if (navigator.sendBeacon) { navigator.sendBeacon(url, new Blob([json], { type: "text/plain" })); }
    else { fetch(url, { method: "POST", body: json, keepalive: true, mode: "no-cors", headers: { "Content-Type": "text/plain" } }); }
  }
  // Tilda passes the form either as a jQuery object or as the element itself.
  // (Don't test $form[0]: on a <form> element that is its first field.)
  function unwrap($form) { return ($form && $form.jquery) ? $form[0] : $form; }
  function formName(form) {
    return (form && form.getAttribute && (form.getAttribute("name") || form.getAttribute("data-formactiontype"))) || "";
  }
  // Visitor's contact fields: Tilda marks them with data-tilda-rule, else match by name.
  var CONTACT = { name: /^(name|full_?name|имя|fio|фио)$/i, email: /^(e-?mail|почта)$/i, phone: /^(phone|tel|телефон)$/i };
  function contactOf(el, data) {
    var v = (el.value || "").trim();
    if (!v) return;
    var rule = el.getAttribute("data-tilda-rule") || "";
    Object.keys(CONTACT).forEach(function (k) {
      if (!data[k] && (rule === k || CONTACT[k].test(el.name || ""))) data[k] = v.slice(0, 200);
    });
  }
  // A multi-step form drops a step's inputs when it moves on: keep the contacts typed so far (in memory only).
  var typed = {};
  document.addEventListener("focusout", function (e) {
    var el = e.target;
    if (el && el.form && /^(INPUT|TEXTAREA)$/.test(el.tagName)) { var d = {}; contactOf(el, d); Object.keys(d).forEach(function (k) { typed[k] = d[k]; }); }
  }, true);
  function contacts(form, data) {
    if (form && form.querySelectorAll) form.querySelectorAll("input, textarea").forEach(function (el) { contactOf(el, data); });
    Object.keys(typed).forEach(function (k) { if (!data[k]) data[k] = typed[k]; });
  }
  function isTilda(form) {
    return !!form && !!form.closest && (/(^|\\s)t-form(\\s|$)/.test(form.className || "") || !!form.closest(".t-rec, .t-popup"));
  }

  // 2. Report the lead once the form is sent: Tilda's success callback / event, a
  //    thank-you screen, or a send that leaves the page. Repeats are merged into one
  //    lead on the server (by click_id). Contacts typed in the form are remembered as
  //    they are typed, since Tilda clears its fields after a successful send.
  //    Visitors who did not come through a tracker link are reported too, as
  //    "direct" registrations: one per page view (sid), only with an e-mail or phone.
  var last = 0;
  var sid = "";
  function pageViewId() {
    if (!sid) sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    return sid;
  }
  // force: a confirmed send (a non-Tilda form's thank-you screen), never skipped as a repeat
  window.tlConversion = function ($form, force) {
    try {
      var clickId = val("click_id");
      var now = Date.now();
      // the button click and the form's submit event fire together — send once
      if (!force && now - last < 1500) return;
      var form = unwrap($form);
      var data = { pageUrl: location.href, formname: formName(form) };
      FIELDS.forEach(function (n) { var v = val(n); if (v) data[n] = v; });
      contacts(form, data);
      if (!clickId && !data.email && !data.phone) return;
      // also sent with a click_id: if the click is unknown (an old link), the lead still counts as direct
      data.sid = pageViewId();
      last = now;
      send("/api/track/conversion", data);
    } catch (e) {}
  };
  // Chain our callback after any existing success-callback the form already has.
  window.tlConversionChain = function ($form) {
    try {
      var form = unwrap($form);
      var prev = form && form.getAttribute("data-tl-prev");
      if (prev) { var fn = prev.indexOf("window.") === 0 ? window[prev.slice(7)] : window[prev]; if (typeof fn === "function") fn($form); }
    } catch (e) {}
    window.tlConversion($form);
  };
  function attach() {
    if (!window.jQuery) return;
    window.jQuery(".t-form").each(function () {
      var cur = window.jQuery(this).data("success-callback");
      if (cur === "window.tlConversion" || cur === "window.tlConversionChain") return;
      if (cur) { this.setAttribute("data-tl-prev", cur); window.jQuery(this).data("success-callback", "window.tlConversionChain"); }
      else { window.jQuery(this).data("success-callback", "window.tlConversion"); }
    });
  }
  attach();
  window.addEventListener("load", attach);
  setTimeout(attach, 1500);
  setTimeout(attach, 3000);
  // Current Tilda forms (no jQuery) fire this native event on the form after a successful send.
  document.addEventListener("tildaform:aftersuccess", function (e) { last = 0; window.tlConversion(e.target); }, true);
  // Only a send that went through counts — never a press of a button the form then refused.
  // Tilda: its success callback / event above, or its thank-you box (part 3 calls tlConversion).
  // Other forms: a thank-you screen (part 3), or — here — a send that leaves the page.
  // bubbling, after the page's own handlers: not prevented = the browser leaves with the form
  window.addEventListener("submit", function (e) { if (!isTilda(e.target) && !e.defaultPrevented) window.tlConversion(e.target, true); });
${FORMS_JS}
})();
`;
}
