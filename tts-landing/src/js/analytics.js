  /* ═══════════ АНАЛИТИКА ФОРМЫ ═══════════
     Анонимно: значения текстовых полей (имя, email, телефон, telegram, возраст)
     не уходят никуда — только факт заполнения, длина и валидность. Любая ошибка
     здесь глотается: аналитика не может сломать страницу или форму. */
  var A_IDLE = 30 * 60 * 1000, A_BATCH = 10, A_EVERY = 3000;
  var aQ = [], aTimer = 0, aSeq = 0, aSid = '', aVid = '', aT0 = 0, aOn = false, aDone = false;
  var aStarted = false, aLastField = null, aFocus = {}, aSeen = {};
  function aStore(kind){ try{ var s = window[kind]; s.getItem('x'); return s }catch(e){ return null } }
  var aLS = aStore('localStorage'), aSS = aStore('sessionStorage');
  function aGet(s, k){ try{ return s ? s.getItem(k) : null }catch(e){ return null } }
  function aSet(s, k, v){ try{ if(s) s.setItem(k, v) }catch(e){} }
  function aRid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 10) }
  function aIds(){
    var now = Date.now();
    aVid = aVid || aGet(aLS, 'tt_vid') || aRid();
    aSet(aLS, 'tt_vid', aVid);
    var sid = aGet(aSS, 'tt_sid') || aSid, last = +aGet(aSS, 'tt_last') || 0;
    // новая сессия после 30 минут простоя
    if(!sid || (last && now - last > A_IDLE)){
      sid = aRid(); aSet(aSS, 'tt_sid', sid); aSet(aSS, 'tt_t0', String(now)); aSet(aSS, 'tt_seq', '0'); aSet(aSS, 'tt_fs', '');
      aT0 = now; aSeq = 0;
    }
    if(sid !== aSid){ aSid = sid; aT0 = +aGet(aSS, 'tt_t0') || aT0 || now; aSeq = +aGet(aSS, 'tt_seq') || aSeq; aStarted = aGet(aSS, 'tt_fs') === '1' }
    aSet(aSS, 'tt_last', String(now));
  }
  function analyticsIds(){ try{ aIds() }catch(e){} return {session: aSid, visitor: aVid} }
  function aDevice(){
    var w = window.innerWidth || 0, ua = navigator.userAgent || '';
    if(/iPad|Tablet/i.test(ua) || (w >= 768 && w < 1024 && /Mobi|Android/i.test(ua))) return 'tablet';
    return /Mobi|Android|iPhone/i.test(ua) || w < 768 ? 'mobile' : 'desktop';
  }
  // контекст сессии: уходит с каждой пачкой, сервер берёт его из первой
  function aCtx(){
    var q = new URLSearchParams(location.search), c = {};
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','click_id'].forEach(function(k){ if(q.get(k)) c[k] = q.get(k).slice(0, 200) });
    c.referrer = (document.referrer || '').slice(0, 500);
    c.url = location.href.slice(0, 500);
    c.device = aDevice();
    c.screen = window.screen ? screen.width : 0;
    c.lang = lang;
    c.fields = CONFIG.fields.map(function(f){ return {k: f.k, kind: f.kind, cond: !!f.conditional, req: f.req === true} });
    return c;
  }
  function aSend(beacon){
    if(!aQ.length || !aOn) return;
    clearTimeout(aTimer); aTimer = 0;
    var batch = aQ.splice(0, 50);
    var body = JSON.stringify({v: 1, sid: aSid, vid: aVid, form: CONFIG.formId, project: CONFIG.projectSlug,
                               test: DEBUG, ctx: aCtx(), events: batch});
    var ok = false;
    // text/plain — «простой» запрос, без CORS preflight
    try{ if(beacon && navigator.sendBeacon) ok = navigator.sendBeacon(CONFIG.collectorUrl, new Blob([body], {type: 'text/plain'})) }catch(e){}
    if(!ok){
      try{
        fetch(CONFIG.collectorUrl, {method: 'POST', body: body, keepalive: body.length < 60000, credentials: 'omit',
                                    headers: {'Content-Type': 'text/plain'}})
          .catch(function(){ if(!beacon && batch[0].r !== 1){ batch.forEach(function(e){ e.r = 1 }); aQ = batch.concat(aQ) } });
      }catch(e){}
    }
    if(aQ.length) aSend(beacon);
  }
  function emit(type, field, meta){
    try{
      if(!aOn) return;
      aIds();
      aSeq++; aSet(aSS, 'tt_seq', String(aSeq));
      var now = Date.now(), ev = {id: aSid + '.' + aSeq, t: type, ts: now, o: now - aT0};
      if(field) ev.f = field;
      if(meta) ev.m = meta;
      aQ.push(ev);
      if(type === 'submit_success') aDone = true;   // после отправки «ушёл» уже не считается
      if(DEBUG) console.log('[tt]', type, field || '', meta || '');
      if(aQ.length >= A_BATCH) aSend(false);
      else if(!aTimer) aTimer = setTimeout(function(){ aSend(false) }, A_EVERY);
    }catch(e){}
  }
  // наблюдатель «один раз»: секции, форма, блок «приём закрыт»
  function aOnce(el, fn, margin){
    if(!el || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function(en){
      en.forEach(function(x){ if(x.isIntersecting){ io.unobserve(x.target); try{ fn(x.target) }catch(e){} } });
    }, {rootMargin: margin || '0px 0px -40% 0px', threshold: 0});
    io.observe(el);
  }
  function watchClosedView(){
    try{ aOnce(document.getElementById('ttClosed'), function(){ emit('form_closed_view') }, '0px') }catch(e){}
  }
  function aFieldKey(el){ return el && el.name && FIELD[el.name] ? el.name : null }
  // первое взаимодействие с формой (фокус, выбор, галочка или сразу «Отправить»)
  function aStart(k){
    if(aStarted || !aOn) return;
    aStarted = true; aSet(aSS, 'tt_fs', '1');
    emit('form_start', k || null);
  }
  function startAnalytics(){
    var ua = navigator.userAgent || '';
    var bot = navigator.webdriver === true || /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|telegrambot|whatsapp/i.test(ua);
    aOn = DEBUG || !bot;          // ботам не шлём; ?tt_debug=1 шлёт всегда (как тест)
    if(!aOn) return;
    emit('page_view', null, {path: location.pathname});
    // какие условные поля видны сейчас: знаменатель для них — только те, кому поле показали
    CONFIG.fields.forEach(function(f){ if(f.conditional && shownState[f.k]) emit('field_shown', f.k) });
    CONFIG.sections.forEach(function(id){
      aOnce(document.getElementById(id), function(){ emit('section_view', null, {s: id}) });
    });
    aOnce(form, function(){ emit('form_view') }, '0px 0px -20% 0px');
    form.addEventListener('focusin', function(e){
      var k = aFieldKey(e.target); if(!k) return;
      aStart(k);
      aSeen[k] = (aSeen[k] || 0) + 1;
      aFocus[k] = Date.now(); aLastField = k;
      emit('field_focus', k, {n: aSeen[k]});
    });
    form.addEventListener('focusout', function(e){
      var k = aFieldKey(e.target); if(!k) return;
      var s = fieldState(k), m = {filled: s.filled, valid: s.valid, dur: aFocus[k] ? Date.now() - aFocus[k] : 0};
      if(FIELD[k].kind === 'text') m.len = s.len;
      delete aFocus[k];
      emit('field_blur', k, m);
      if(s.filled && !s.valid) emit('field_error', k, {error: 'invalid', on: 'blur'});
    });
    // значение пишем только у категорий (select / галочки), не у текстовых полей
    form.addEventListener('change', function(e){
      var k = aFieldKey(e.target); if(!k) return;
      aStart(k);
      if(FIELD[k].kind === 'text') return;
      aLastField = k;
      var v = FIELD[k].kind === 'check' ? (e.target.checked ? 'yes' : 'no') : String(e.target.value || '').slice(0, 40);
      emit('field_change', k, {value: v, filled: fieldState(k).filled});
    });
    // уходя, всегда досылаем очередь; «ушёл» пишем, только если заявку не отправили
    // скрытие вкладки и pagehide приходят парой — сводку шлём одну на каждый уход
    var left = false;
    function leave(){
      if(!left && !aDone) emit('abandon', aLastField, {filled: filledList(), elapsed: Date.now() - aT0, started: aStarted});
      left = true;
      aSend(true);
    }
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'hidden') leave(); else left = false;
    });
    window.addEventListener('pagehide', leave);
    window.addEventListener('pageshow', function(){ left = false });
  }
