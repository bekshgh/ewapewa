  /* ═══════════ ЯЗЫК ═══════════ */
  var lang = 'ru', ruCaptured = false;
  // строка интерфейса на текущем языке (ui.json); нет перевода — русский
  function t(group){ var g = UI[group]; return g[lang] || g.ru }
  // русский текст уже лежит в разметке — снимаем его один раз,
  // чтобы не дублировать каждую строку атрибутом data-ru
  function captureRu(){
    if(ruCaptured) return;
    root.querySelectorAll('[data-en]').forEach(function(el){ el._ru = el.innerHTML });
    root.querySelectorAll('[data-en-placeholder]').forEach(function(el){ el._ruPh = el.getAttribute('placeholder') || '' });
    root.querySelectorAll('[data-en-aria]').forEach(function(el){ el._ruAria = el.getAttribute('aria-label') || '' });
    root.querySelectorAll('[data-en-alt]').forEach(function(el){ el._ruAlt = el.getAttribute('alt') || '' });
    ruCaptured = true;
  }
  // если для языка перевода нет — показываем русский оригинал
  function pick(el, suffix, fallback){
    if(lang === 'ru') return fallback;
    var v = el.getAttribute('data-' + lang + suffix);
    return v === null ? fallback : v;
  }
  function paint(){
    captureRu();
    root.setAttribute('lang', lang);
    try{ document.documentElement.setAttribute('lang', lang); }catch(e){}
    root.querySelectorAll('[data-en]').forEach(function(el){
      if(lang === 'ru'){ el.innerHTML = el._ru; return; }
      var v = pick(el, '', null);
      if(v === null){ el.innerHTML = el._ru; return; }
      // разметку внутри строки (звёздочка у label, <b> в тексте) отдаём как HTML
      if(v.indexOf('<') > -1) el.innerHTML = v; else el.textContent = v;
    });
    root.querySelectorAll('[data-en-placeholder]').forEach(function(el){
      el.setAttribute('placeholder', pick(el, '-placeholder', el._ruPh));
    });
    root.querySelectorAll('[data-en-aria]').forEach(function(el){
      el.setAttribute('aria-label', pick(el, '-aria', el._ruAria));
    });
    root.querySelectorAll('[data-en-alt]').forEach(function(el){
      el.setAttribute('alt', pick(el, '-alt', el._ruAlt));
    });
    root.querySelectorAll('.lang button').forEach(function(b){
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang));
    });
    try{
      document.title = t('meta').t;
      var d = document.querySelector('meta[name="description"]');
      if(d) d.setAttribute('content', t('meta').d);
    }catch(e){}
    tick();
    buildTag();
    // подпись «направления» зависит от статуса: без этого смена языка
    // возвращала подпись из разметки (баг исходной версии)
    try{ syncUniLabel() }catch(e){}
  }
  var swapping = 0;
  function applyLang(next, animate){
    var n = CONFIG.langs.indexOf(next) > -1 ? next : 'ru';
    if(n === lang && ruCaptured) return;
    if(!animate || reduced){ lang = n; paint(); return; }
    clearTimeout(swapping);
    root.classList.add('lang-swap');
    swapping = setTimeout(function(){
      lang = n; paint();
      raf(function(){ raf(function(){ root.classList.remove('lang-swap') }) });
    }, 130);
  }
  root.querySelectorAll('.lang button').forEach(function(b){
    b.addEventListener('click', function(){
      var next = b.getAttribute('data-lang');
      if(next !== lang) emit('lang_switch', null, {from: lang, to: next});
      applyLang(next, true);
    });
  });
