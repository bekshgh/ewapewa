  /* ═══════════ НАСТРОЙКИ НАБОРА ═══════════
     Всё, что меняется от набора к набору, — здесь и только здесь. */
  var CONFIG = {
    formId: 'tts-f26-registration',
    // = ключ папки проекта в трекере (Campaigns → Projects), чтобы воронка формы
    // встала рядом с кампаниями проекта и его EwA2oGX / EwA2MXP
    projectSlug: 'toptalentssprint-f26',
    // приём заявок: 10 сентября 2026, 23:59 по Алматы (UTC+5)
    opened:   '2026-08-01T00:00:00+05:00',
    deadline: '2026-09-10T23:59:59+05:00',
    // true закрывает приём досрочно, не сдвигая дату на странице
    forceClosed: false,
    // коллектор аналитики в трекере (Vercel)
    collectorUrl: /*__COLLECTOR_URL__*/'https://ewapewa-utm-tracker.vercel.app/api/collect',
    // заявки по-прежнему уходят в Google Apps Script → таблица
    appsScriptUrl: /*__APPS_SCRIPT_URL__*/'https://script.google.com/macros/s/AKfycbw9x0W_hzJLvC4nQpkRqXUNe9ighPpIt3CrlHWH96SOc4n3S4K7vCwJl21ui8aMXdfc/exec',
    // ВНИМАНИЕ: любой, кто откроет страницу, видит это значение. Это не защита;
    // защищать нужно на стороне Apps Script (см. README).
    appsScriptSecret: 'tts-sprint-2026-TTS_SECRET',
    langs: ['ru', 'en'],
    /* Поля формы в порядке на странице. kind: text — значение никогда не уходит
       в аналитику; select / check — категории, их значение пишется.
       req: true — всегда обязательное; объект — обязательное по условию;
       false — необязательное. */
    fields: [
      {k:'name',      kind:'text',   req:true, check:'nonempty', ru:'Имя и фамилия',        en:'Full name'},
      {k:'email',     kind:'text',   req:true, check:'email',    ru:'Email',                en:'Email'},
      {k:'phone',     kind:'text',   req:true, check:'phone',    ru:'Телефон',              en:'Phone'},
      {k:'telegram',  kind:'text',   req:true, check:'telegram', ru:'Telegram',             en:'Telegram'},
      {k:'city',      kind:'select', req:true,                   ru:'Город',                en:'City'},
      {k:'age',       kind:'text',   req:true, check:'age',      ru:'Возраст',              en:'Age'},
      {k:'status',    kind:'select', req:true,                   ru:'Чем занят сейчас',     en:'What you do now'},
      // поле курса показывается только студентам (условное поле)
      {k:'course',    kind:'select', req:{field:'status', eq:'student'}, conditional:true,
                                                                 ru:'Год обучения',         en:'Year of study'},
      {k:'university',kind:'select', req:{field:'status', eq:'student'},
                                                                 ru:'Направление обучения', en:'Field of study'},
      {k:'universityName', kind:'select', req:false,              ru:'Университет',          en:'University'},
      {k:'english',   kind:'select', req:true,                   ru:'Уровень английского',  en:'Level of English'},
      {k:'relocation',kind:'select', req:true,                   ru:'Готовность к переезду',en:'Readiness to relocate'},
      // при «не готов к переезду» подтверждение снимается с обязательных (условное поле)
      {k:'confirmRelocation', kind:'check', req:{field:'relocation', ne:'no'}, conditional:true,
                                                                 ru:'Подтверждение релокации',      en:'Relocation confirmation'},
      {k:'confirmData',       kind:'check', req:true,            ru:'Согласие на обработку данных', en:'Data processing consent'}
    ],
    // подпись поля «направление» зависит от того, обязательное ли оно
    universityLabel: {
      ru:{on:'Направление обучения *', off:'Направление обучения'},
      en:{on:'Field of study *',       off:'Field of study'}
    },
    // секции, просмотр которых считаем (section_view)
    sections: ['hero','proof','higgsfield','aiesec','benefits','fit','tagline','process','agenda','apply','faq','programs','final']
  };
  var UI = __UI_STRINGS__;
  var DEADLINE = new Date(CONFIG.deadline).getTime();
  var OPENED   = new Date(CONFIG.opened).getTime();
  // ?tt_debug=1 — события в консоль, сессия помечается тестовой, а форма
  // после дедлайна открывается ТОЛЬКО в этом браузере (для проверки)
  var DEBUG = /(?:^|[?&])tt_debug=1(?:&|$)/.test(location.search);
  function fmt(s, vars){ return s.replace(/\{(\w+)\}/g, function(_, k){ return vars[k] }) }
  var root = document.getElementById('tt');
  if(!root) return;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var raf = window.requestAnimationFrame || function(f){ return setTimeout(f,16) };
