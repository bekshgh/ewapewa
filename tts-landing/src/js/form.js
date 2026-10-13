  /* ═══════════ ФОРМА: живой счётчик, поля, ошибки ═══════════
     Обязательные поля и условия берутся из CONFIG.fields. */
  var form = document.getElementById('ttForm');
  var msg = document.getElementById('ttFormMsg'),
      meterN = document.getElementById('ttMeterN'),
      meterBar = document.getElementById('ttMeterBar');
  var FIELD = {};
  CONFIG.fields.forEach(function(f){ FIELD[f.k] = f });

  function rawValue(k){
    var el = form.elements[k];
    if(!el) return '';
    if(el.type === 'checkbox') return el.checked;
    return String(el.value || '').trim();
  }
  // обязательно ли поле сейчас (условие из CONFIG: {field, eq} или {field, ne})
  function isRequired(f){
    if(f.req === true || f.req === false) return f.req;
    var v = rawValue(f.req.field);
    return 'eq' in f.req ? v === f.req.eq : v !== f.req.ne;
  }
  // порядок = порядок в форме: по нему выбираем, на какое поле указать в ошибке
  function requiredNow(){ return CONFIG.fields.filter(isRequired) }

  var CHECKS = {
    nonempty: function(){ return true },
    email:    function(v){ return v.indexOf('@') > 0 && v.indexOf('.', v.indexOf('@')) > 0 },
    age:      function(v){ return Number(v) >= 18 && Number(v) <= 70 },
    telegram: function(v){ return /^@[A-Za-z0-9_]{4,32}$/.test(v) },
    phone:    function(v){ return v.replace(/\D/g,'').length >= 10 }
  };
  // состояние поля для счётчика и для аналитики (без самого значения)
  function fieldState(k){
    var f = FIELD[k], el = form.elements[k];
    if(!f || !el) return {filled:false, valid:false, len:0};
    if(f.kind === 'check') return {filled:el.checked, valid:el.checked, len:0};
    var v = String(el.value).trim();
    if(!v) return {filled:false, valid:false, len:0};
    var check = f.check && CHECKS[f.check];
    return {filled:true, valid: check ? check(v) : true, len:v.length};
  }
  function isFilled(f){ var s = fieldState(f.k); return s.filled && s.valid }
  function box(f){
    var el = form.elements[f.k];
    return el ? el.closest(f.kind === 'check' ? '.chk' : '.fld') : null;
  }
  function updateMeter(){
    var req = requiredNow(), n = 0;
    req.forEach(function(f){
      var ok = isFilled(f), b = box(f);
      if(ok) n++;
      if(b){ b.classList.toggle('ok', ok); if(ok) b.classList.remove('bad'); }
    });
    meterN.textContent = n + ' / ' + req.length;
    meterBar.style.transform = 'scaleX(' + (n / req.length) + ')';
    return n;
  }

  /* ═══════════ КУРС И НАПРАВЛЕНИЕ: для студентов ═══════════ */
  var uniLabel = document.getElementById('ttUniLabel'),
      statusSel = document.getElementById('f-status'),
      courseFld = document.getElementById('ttCourseFld'),
      courseSel = document.getElementById('f-course');
  var shownState = {}, quietVis = false;
  // условное поле показали/спрятали — для знаменателей воронки
  function markShown(k, on){
    if(shownState[k] === on) return;
    var first = !(k in shownState);
    shownState[k] = on;
    if(first && !on) return;        // скрыто с самого начала — не событие
    if(quietVis) return;            // сброс формы после отправки — не действие человека
    emit(on ? 'field_shown' : 'field_hidden', k);
  }
  // схлопнули — ждём конца анимации и только тогда убираем из потока,
  // иначе в сетке остаётся пустой зазор
  var courseTimer = 0;
  function showCourse(on){
    if(!courseFld) return;
    clearTimeout(courseTimer);
    if(on){
      courseFld.classList.remove('gone');
      void courseFld.offsetHeight;      // пересчёт, иначе переход не стартует
      courseFld.classList.add('show');
    } else {
      courseFld.classList.remove('show');
      courseFld.classList.remove('bad');
      courseFld.classList.remove('ok');
      if(courseSel) courseSel.value = '';
      // transitionend не приходит, если перехода не было — добиваем таймером
      courseTimer = setTimeout(function(){
        if(!courseFld.classList.contains('show')) courseFld.classList.add('gone');
      }, reduced ? 0 : 420);
    }
    markShown('course', on);
  }
  function syncUniLabel(){
    if(!uniLabel || !statusSel) return;
    var l = CONFIG.universityLabel[lang] || CONFIG.universityLabel.ru;
    uniLabel.textContent = isRequired(FIELD.university) ? l.on : l.off;
  }
  function syncUni(){
    if(!statusSel) return;
    showCourse(isRequired(FIELD.course));
    syncUniLabel();
    var b = box(FIELD.university);
    if(b && !isRequired(FIELD.university)) b.classList.remove('bad');
    updateMeter();
  }
  statusSel.addEventListener('change', syncUni);

  /* ═══════════ ГОТОВНОСТЬ К ПЕРЕЕЗДУ ═══════════ */
  // с ответом «не готов» подтверждать готовность бессмысленно: снимаем
  // галочку из обязательных, но заявку принимаем и отправляем как есть
  var relocSel = document.getElementById('f-reloc'),
      relocChk = document.getElementById('f-c1'),
      relocRow = relocChk ? relocChk.closest('.chk') : null;
  function syncReloc(){
    if(!relocSel) return;
    var need = isRequired(FIELD.confirmRelocation);
    if(!need){
      if(relocChk) relocChk.checked = false;
      if(relocRow){ relocRow.classList.add('muted'); relocRow.classList.remove('bad') }
    } else if(relocRow) relocRow.classList.remove('muted');
    markShown('confirmRelocation', need);
    updateMeter();
  }
  if(relocSel) relocSel.addEventListener('change', syncReloc);
  form.addEventListener('input', updateMeter);
  form.addEventListener('change', updateMeter);

  /* ═══════════ ОТПРАВКА В GOOGLE APPS SCRIPT ═══════════ */
  function ttsCollect(){
    var q = new URLSearchParams(location.search);
    var data = { secret: CONFIG.appsScriptSecret };
    CONFIG.fields.forEach(function(f){ data[f.k] = rawValue(f.k) });
    data.lang = lang;
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(k){ data[k] = q.get(k) || '' });
    data.page = location.href;
    data.referrer = document.referrer || '';
    // связка строки заявки с воронкой и UTM в трекере
    var ids = analyticsIds();
    data.session_id = ids.session;
    data.visitor_id = ids.visitor;
    data.is_test = DEBUG;
    return data;
  }
  function ttsSend(payload){
    return fetch(CONFIG.appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      keepalive: true
    })
      .then(function(r){
        if(!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(j){
        if(!j || j.ok !== true) throw new Error(j && j.error || 'bad response');
        return j;
      });
  }
  form.addEventListener('submit', function(e){
    e.preventDefault();
    if(isClosed()) return;
    aStart(null);
    emit('submit_attempt', null, {filled: filledList()});
    var missing = requiredNow().filter(function(f){ return !isFilled(f) });
    missing.forEach(function(f){
      var b = box(f); if(b) b.classList.add('bad');
      emit('field_error', f.k, {error: fieldState(f.k).filled ? 'invalid' : 'required', on:'submit'});
    });
    updateMeter();
    if(missing.length){
      emit('submit_blocked', null, {missing: missing.map(function(f){ return f.k })});
      var first = missing[0], label = first[lang] || first.ru, m = t('form');
      msg.className = 'fmsg show err';
      msg.textContent = missing.length === 1
        ? fmt(m.one, {label: lang === 'ru' ? label.toLowerCase() : label})
        : fmt(m.many, {n: missing.length, label: label});
      var el = form.elements[first.k];
      if(el){
        var y = el.getBoundingClientRect().top + window.pageYOffset - 160;
        window.scrollTo({top:y, behavior: reduced ? 'auto' : 'smooth'});
        setTimeout(function(){ el.focus({preventScroll:true}) }, reduced ? 0 : 420);
      }
      return;
    }
    var btn = form.querySelector('[type="submit"]');
    if (btn && btn.disabled) return;
    if (btn) btn.disabled = true;

    msg.className = 'fmsg show';
    msg.textContent = t('form').sending;

    var city = form.elements['city'].value;

    ttsSend(ttsCollect())
      .then(function(){
        emit('submit_success', null, {city: city});
        msg.className = 'fmsg';
        msg.textContent = '';
        openModal(city);
        form.reset();
        // reset() не бросает change, поэтому условные поля пересчитываем руками:
        // иначе «курс» остаётся висеть, а счётчик считает снятые пункты
        quietVis = true;
        try{ syncUni() }catch(e){}
        try{ syncReloc() }catch(e){}
        quietVis = false;
        updateMeter();
      })
      .catch(function(err){
        console.error('TTS submit failed', err);
        emit('submit_error', null, {error: String(err && err.message || err).slice(0, 120)});
        msg.className = 'fmsg show err';
        msg.textContent = t('form').failed;
      })
      .then(function(){ if (btn) btn.disabled = false; });
  });
  // заполненные поля (только названия) — для сводки при уходе и при отправке
  function filledList(){
    return CONFIG.fields.filter(function(f){ return fieldState(f.k).filled }).map(function(f){ return f.k });
  }
