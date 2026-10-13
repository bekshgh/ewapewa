  /* ═══════════ REVEAL + СЧЁТЧИКИ ═══════════ */
  function countUp(el){
    var to = parseFloat(el.getAttribute('data-count'));
    var dec = parseInt(el.getAttribute('data-dec')||'0',10);
    var plain = el.getAttribute('data-plain') === '1';
    var dur = 900, start = null;
    function fmt(v){
      var s = v.toFixed(dec);
      if(plain) return s;
      return dec ? s.replace('.', ',') : s;
    }
    var done = false;
    function finish(){ if(done) return; done = true; el.textContent = fmt(to); }
    function step(ts){
      if(done) return;
      if(start === null) start = ts;
      var p = Math.min((ts-start)/dur, 1);
      var eased = 1 - Math.pow(1-p, 3);          // ease-out cubic
      el.textContent = fmt(to*eased);
      if(p < 1) raf(step); else finish();
    }
    raf(step);
    // если rAF не идёт (фоновая вкладка, троттлинг) — просто показать итог
    setTimeout(finish, dur + 400);
  }
  var revealables = root.querySelectorAll('.rv');
  var h1 = document.getElementById('ttH1');
  if(!reduced && 'IntersectionObserver' in window){
    root.classList.add('js');   // без этого класса всё видно сразу — страховка
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(!en.isIntersecting) return;
        en.target.classList.add('in');
        en.target.querySelectorAll('[data-count]').forEach(countUp);
        io.unobserve(en.target);
      });
    }, {rootMargin:'0px 0px -10% 0px', threshold:.08});
    revealables.forEach(function(el){ io.observe(el) });
    raf(function(){
      root.querySelectorAll('#hero .rv').forEach(function(el){
        el.classList.add('in');
        el.querySelectorAll('[data-count]').forEach(countUp);
        io.unobserve(el);
      });
    });
    raf(function(){ h1.classList.add('in') });
    setTimeout(function(){
      if(root.querySelector('.rv.in')) return;
      revealables.forEach(function(el){
        el.classList.add('in');
        el.querySelectorAll('[data-count]').forEach(countUp);
      });
    }, 1700);
  } else {
    root.querySelectorAll('[data-count]').forEach(function(el){
      var dec = parseInt(el.getAttribute('data-dec')||'0',10);
      var v = parseFloat(el.getAttribute('data-count')).toFixed(dec);
      el.textContent = el.getAttribute('data-plain')==='1' ? v : v.replace('.',',');
    });
  }
  /* ═══════════ TAGLINE: слова загораются в порядке чтения ═══════════ */
  var tagEl = document.getElementById('ttTag'), tagWords = [], tagLit = -1;
  var TAG_KEYS = ['сейчас','год','now','year'];
  function buildTag(){
    if(!tagEl) return;
    var txt = tagEl.textContent.replace(/\s+/g,' ').trim();
    tagEl.textContent = '';
    tagWords = txt.split(' ').map(function(w, i){
      var sp = document.createElement('span');
      sp.className = 'w' + (TAG_KEYS.indexOf(w.replace(/[.,—:;]/g,'').toLowerCase()) > -1 ? ' key' : '');
      sp.textContent = w;
      tagEl.appendChild(sp);
      if(i < txt.split(' ').length - 1) tagEl.appendChild(document.createTextNode(' '));
      return sp;
    });
    tagLit = -1;
    updateTag();
  }
  function litAll(){
    if(tagLit === tagWords.length) return;
    tagWords.forEach(function(w){ w.classList.add('lit') });
    tagLit = tagWords.length;
  }

  function updateTag(){
    if(!tagWords.length) return;
    if(reduced){ litAll(); return; }
    var r = tagEl.getBoundingClientRect(), vh = window.innerHeight;
    // фраза прошла центр экрана — досвечиваем целиком и больше не трогаем
    if(r.top + r.height / 2 <= vh * .5){ litAll(); return; }
    var travelled = vh * .88 - r.top;
    var span = Math.max(vh * .38 + r.height / 2, 1);
    var p = Math.min(Math.max(travelled / span, 0), 1);
    var lit = Math.ceil(p * tagWords.length);
    if(lit <= tagLit) return;                 // назад не отматываем
    for(var i = tagLit < 0 ? 0 : tagLit; i < lit; i++) tagWords[i].classList.add('lit');
    tagLit = lit;
  }

  /* ═══════════ РАСПИСАНИЕ: ЛИНИЯ ЗАПОЛНЯЕТСЯ ПО ПРОКРУТКЕ ═══════════ */
  // теперь колонок несколько — у каждой своя линия и свои точки
  var agLists = Array.prototype.slice.call(root.querySelectorAll('.ag')).map(function(el){
    return {
      el: el,
      fill: el.querySelector('.ag-fill'),
      items: Array.prototype.slice.call(el.querySelectorAll('.ag-i')),
      p: -1
    };
  });

  function updateAgenda(){
    for(var k = 0; k < agLists.length; k++){
      var g = agLists[k];
      if(!g.items.length) continue;
      if(reduced){
        if(g.p !== 1){
          g.items.forEach(function(el){ el.classList.add('on') });
          if(g.fill) g.fill.style.transform = 'scaleY(1)';
          g.p = 1;
        }
        continue;
      }
      var line = window.innerHeight * .62;          // «строка чтения»
      var r = g.el.getBoundingClientRect();
      var p = Math.min(Math.max((line - r.top) / Math.max(r.height, 1), 0), 1);
      if(g.fill && Math.abs(p - g.p) > .002){
        g.fill.style.transform = 'scaleY(' + p.toFixed(4) + ')';
        g.p = p;
      }
      for(var i = 0; i < g.items.length; i++){
        var d = g.items[i].querySelector('.ag-d');
        if(!d) continue;
        var b = d.getBoundingClientRect();
        var on = b.top + b.height / 2 <= line;
        if(on !== g.items[i]._on){
          g.items[i]._on = on;
          g.items[i].classList.toggle('on', on);
        }
      }
    }
  }

  /* ═══════════ ГОРИЗОНТАЛЬНАЯ ЛЕНТА ЭТАПОВ ═══════════ */
  var pinWrap = document.getElementById('process'),
      track = document.getElementById('ttTrack'),
      pinRail = document.getElementById('ttPinRail');
  // sticky ломается, если у любого предка есть прокрутка/обрезка по вертикали
  // (в Tilda такое встречается) — тогда лента просто раскладывается сеткой
  function stickyWorks(){
    var el = pinWrap.parentElement;
    while(el && el !== document.documentElement){
      var oy = getComputedStyle(el).overflowY;
      if(oy && oy !== 'visible') return false;
      el = el.parentElement;
    }
    return true;
  }
  function pinEnabled(){
    return !reduced
      && window.matchMedia('(min-width:960px) and (min-height:640px)').matches
      && stickyWorks();
  }
  function syncPinMode(){
    if(pinEnabled()){ pinWrap.classList.add('on'); }
    else { pinWrap.classList.remove('on'); track.style.transform=''; pinRail.style.width='0'; }
  }
  syncPinMode();
  function updatePin(){
    if(!pinWrap.classList.contains('on')) return;
    var r = pinWrap.getBoundingClientRect();
    var span = pinWrap.offsetHeight - window.innerHeight;
    if(span <= 0) return;
    var p = Math.min(Math.max(-r.top / span, 0), 1);
    // симметричные поля: лента доезжает ровно до правого края контент-колонки
    var host = track.parentElement;
    var L = host.getBoundingClientRect().left + parseFloat(getComputedStyle(host).paddingLeft);
    var dist = track.scrollWidth - (window.innerWidth - L * 2);
    track.style.transform = 'translate3d(' + (-p * Math.max(dist,0)) + 'px,0,0)';
    pinRail.style.width = (p*100) + '%';
    // подсветка этапа, который сейчас у левого края
    var st = track.children, idx = Math.round(p * (st.length - 1));
    for(var i=0;i<st.length;i++) st[i].classList.toggle('now', i === idx);
  }
  /* ═══════════ ПРОГРЕСС-БАР СТРАНИЦЫ ═══════════ */
  var prog = document.getElementById('ttProg');
  function updateProg(){
    var h = document.documentElement.scrollHeight - window.innerHeight;
    prog.style.width = h > 0 ? ((window.pageYOffset / h) * 100).toFixed(2) + '%' : '0%';
  }
  var queued = false;
  function onScroll(){
    if(queued) return;
    queued = true;
    raf(function(){ updateProg(); updatePin(); updateDock(); updateTag(); updateAgenda(); queued = false; });
  }
  window.addEventListener('scroll', onScroll, {passive:true});
  window.addEventListener('resize', function(){ syncPinMode(); onScroll(); });
  onScroll();
  /* ═══════════ КОНФЕТТИ ПОСЛЕ ОТПРАВКИ ═══════════ */
  var confCv = document.getElementById('ttConfetti'), confCtx = null, confParts = [], confRun = false;
  function confetti(){
    if(reduced || !confCv) return;
    if(!confCtx) confCtx = confCv.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    confCv.width = Math.round(innerWidth * dpr);
    confCv.height = Math.round(innerHeight * dpr);
    confCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var COLORS = ['#DAFE17','#FFFFFF','#7E3AF2','#B8E01A'];
    var card = modal.querySelector('.modal-c');
    var cr = card ? card.getBoundingClientRect()
                  : {left:innerWidth/2, top:innerHeight/2, width:0, height:0};
    var cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2, now = performance.now();
    confParts = [];
    var TOTAL = 130;
    for(var i = 0; i < TOTAL; i++){
      // равномерный веер по кругу, чтобы вылетало из-за карточки во все стороны
      var ang = (i / TOTAL) * Math.PI * 2 + (i % 7) * .09;
      var sp  = 7.5 + (i % 17) * .62;
      confParts.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * sp * 1.35,
        vy: Math.sin(ang) * sp * .85 - 2.2,
        w: 5 + (i % 5) * 1.7,
        h: 9 + (i % 7) * 1.5,
        rot: (i * 37 % 360) * Math.PI / 180,
        vr: (((i % 13) - 6) / 6) * .05,
        c: COLORS[i % COLORS.length],
        t: now
      });
    }
    if(confRun) return;
    confRun = true;
    (function tick(){
      var t = performance.now();
      confCtx.clearRect(0, 0, innerWidth, innerHeight);
      var alive = 0;
      for(var k = 0; k < confParts.length; k++){
        var q = confParts[k], age = (t - q.t) / 1000;
        if(age > 4.4) continue;
        alive++;
        q.vy += .19; q.vx *= .9945; q.vy *= .9945;
        q.x += q.vx; q.y += q.vy; q.rot += q.vr;
        confCtx.save();
        confCtx.globalAlpha = Math.max(0, Math.min(1, (4.4 - age) / 1.6));
        confCtx.translate(q.x, q.y);
        confCtx.rotate(q.rot);
        confCtx.fillStyle = q.c;
        confCtx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h * (.4 + Math.abs(Math.cos(q.rot)) * .6));
        confCtx.restore();
      }
      if(alive){ raf(tick) }
      else { confRun = false; confCtx.clearRect(0, 0, innerWidth, innerHeight) }
    })();
  }
  /* ═══════════ ПОПАП ПОСЛЕ ОТПРАВКИ ═══════════ */
  var modal = document.getElementById('ttModal'),
      modalP = document.getElementById('ttModalP'),
      modalBtn = document.getElementById('ttModalBtn'),
      modalX = document.getElementById('ttModalX'),
      lastFocus = null, modalCity = 'none';
  function openModal(city){
    var key = (city === 'astana' || city === 'almaty') ? city : 'none';
    modalP.textContent = t('chat')[key];
    var href = modal.getAttribute('data-tg-' + (key === 'none' ? 'almaty' : key)) || '#';
    modalBtn.setAttribute('href', href);
    modalCity = key;
    lastFocus = document.activeElement;
    modal.classList.add('open');
    modalBtn.focus();
    confetti();
    emit('modal_open', null, {city: key});
    document.addEventListener('keydown', onEsc);
  }
  function closeModal(){
    modal.classList.remove('open');
    document.removeEventListener('keydown', onEsc);
    if(lastFocus) lastFocus.focus();
  }
  function onEsc(e){ if(e.key === 'Escape') closeModal() }
  modalX.addEventListener('click', closeModal);
  modal.addEventListener('click', function(e){ if(e.target === modal) closeModal() });
  modalBtn.addEventListener('click', function(){ emit('tg_join_click', null, {city: modalCity}) });
  /* ═══════════ ТЕКУЩИЙ РАЗДЕЛ В НАВИГАЦИИ ═══════════ */
  var navLinks = Array.prototype.slice.call(root.querySelectorAll('.nav a'));
  if('IntersectionObserver' in window){
    var navMap = navLinks.map(function(a){ return document.querySelector(a.getAttribute('href')) });
    var spy = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(!en.isIntersecting) return;
        var i = navMap.indexOf(en.target);
        navLinks.forEach(function(a, j){
          if(j === i) a.setAttribute('aria-current','true'); else a.removeAttribute('aria-current');
        });
      });
    }, {rootMargin:'-45% 0px -45% 0px', threshold:0});
    navMap.forEach(function(sec){ if(sec) spy.observe(sec) });
  }
  /* ═══════════ КУРСОР-СВЕТ В HERO ═══════════ */
  var spot = document.getElementById('ttSpot'),
      hero = document.getElementById('hero');
  if(!reduced && window.matchMedia('(hover:hover) and (pointer:fine)').matches){
    hero.addEventListener('pointermove', function(e){
      var r = hero.getBoundingClientRect();
      spot.style.setProperty('--mx', ((e.clientX-r.left)/r.width*100)+'%');
      spot.style.setProperty('--my', ((e.clientY-r.top)/r.height*100)+'%');
      spot.style.opacity = '1';
    });
    hero.addEventListener('pointerleave', function(){ spot.style.opacity = '0' });
    // блик на карточках следует за курсором
    root.querySelectorAll('.card').forEach(function(c){
      c.addEventListener('pointermove', function(e){
        var r = c.getBoundingClientRect();
        c.style.setProperty('--cx', ((e.clientX-r.left)/r.width*100)+'%');
        c.style.setProperty('--cy', ((e.clientY-r.top)/r.height*100)+'%');
      });
    });
  }
  /* ═══════════ FAQ ═══════════ */
  root.querySelectorAll('.faq .q').forEach(function(btn){
    btn.addEventListener('click', function(){
      var qa = btn.closest('.qa'), open = qa.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
      if(open) emit('faq_open', null, {q: btn.getAttribute('aria-controls')});
    });
  });
  /* ═══════════ ЛИПКИЙ CTA ═══════════ */
  var dock = document.getElementById('ttDock'),
      dockN = document.getElementById('ttDockN'),
      dockL = document.getElementById('ttDockL'),
      applySec = document.getElementById('apply');
  function updateDock(){
    if(!dock) return;                      // вызывается и до инициализации
    var pastHero = window.pageYOffset > window.innerHeight * .85;
    var r = applySec.getBoundingClientRect();
    var applyVisible = r.top < window.innerHeight && r.bottom > 0;
    dock.classList.toggle('on', pastHero && !applyVisible);
  }
  /* ═══════════ МОБИЛЬНОЕ МЕНЮ ═══════════ */
  var burger = document.getElementById('ttBurger'), mnav = document.getElementById('ttMnav');
  burger.addEventListener('click', function(){
    var open = mnav.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(open));
  });
  mnav.addEventListener('click', function(e){
    if(e.target.tagName === 'A'){ mnav.classList.remove('open'); burger.setAttribute('aria-expanded','false'); }
  });
  /* ═══════════ ПЛАВНЫЙ СКРОЛЛ ═══════════ */
  root.addEventListener('click', function(e){
    var a = e.target.closest('a[href^="#"]');
    if(!a) return;
    var id = a.getAttribute('href');
    if(id === '#') return;
    var t = document.querySelector(id);
    if(!t) return;
    e.preventDefault();
    window.scrollTo({top: t.getBoundingClientRect().top + window.pageYOffset - 70, behavior: reduced ? 'auto' : 'smooth'});
  });
  /* ── курсор, параллакс первого экрана, магнитные кнопки ── */
  (function(){
    var fine = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
    if(reduced || !fine) return;
    var host = document.getElementById('tt');
    /* шлейф: плавная лаймовая линия, которая тает за курсором */
    var cv = document.createElement('canvas');
    cv.className = 'trail'; cv.setAttribute('aria-hidden','true');
    host.appendChild(cv);
    var ctx = cv.getContext('2d'), fw = 0, fh = 0, fr = 0;
    function fit(){
      var w = innerWidth || 1, h = innerHeight || 1,
          dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fw = w; fh = h; fr = dpr;
    }
    fit();
    addEventListener('resize', fit);
    var pts = [], LIFE = 620, LW = 13, MAX = 52, MINSTEP = 2.4;
    var tx = -200, ty = -200, sx = tx, sy = ty, live = false;
    document.addEventListener('pointermove', function(e){
      if(e.pointerType !== 'mouse') return;
      tx = e.clientX; ty = e.clientY;
      if(!live){ live = true; sx = tx; sy = ty; pts.length = 0;
        host.classList.add('trail-on') }
    }, {passive:true});
    document.addEventListener('pointerleave', function(){
      live = false; host.classList.remove('trail-on');
    });
    (function draw(){
      var now = performance.now();
      if(fw !== innerWidth || fh !== innerHeight ||
         fr !== Math.min(window.devicePixelRatio || 1, 2)) fit();
      if(live){
        sx += (tx - sx) * .2; sy += (ty - sy) * .2;   // мягче догоняет — угол не заламывается
        var last = pts[pts.length - 1];
        // точки ближе 2px дают микроизломы на стыках сегментов — их пропускаем
        if(!last || Math.abs(sx - last.x) + Math.abs(sy - last.y) > MINSTEP){
          pts.push({x:sx, y:sy, t:now});
        } else { last.t = now }
        if(pts.length > MAX) pts.shift();
      }
      while(pts.length && now - pts[0].t > LIFE) pts.shift();
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      if(pts.length > 3){
        var head = pts[pts.length - 1], tail = pts[0];
        var g = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
        g.addColorStop(0,   'rgba(218,254,23,0)');
        g.addColorStop(.42, 'rgba(218,254,23,.30)');
        g.addColorStop(.78, 'rgba(218,254,23,.78)');
        g.addColorStop(1,   'rgba(218,254,23,.96)');
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        // ведём кривую по серединам отрезков: каждый узел становится
        // контрольной точкой, поэтому резкий поворот скругляется сам
        ctx.beginPath();
        ctx.moveTo((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
        for(var i = 1; i < pts.length - 1; i++){
          ctx.quadraticCurveTo(pts[i].x, pts[i].y,
            (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
        }
        ctx.quadraticCurveTo(pts[pts.length - 2].x, pts[pts.length - 2].y, head.x, head.y);
        ctx.globalAlpha = .22; ctx.strokeStyle = g; ctx.lineWidth = LW * 2.6; ctx.stroke();
        ctx.globalAlpha = 1;   ctx.strokeStyle = g; ctx.lineWidth = LW;       ctx.stroke();
      }
      raf(draw);
    })();
    /* параллакс: награда и плашка расходятся за курсором */
    var stage = document.getElementById('ttStage');
    if(stage){
      stage.addEventListener('pointermove', function(e){
        var r = stage.getBoundingClientRect();
        var nx = (e.clientX - r.left) / r.width  - .5,
            ny = (e.clientY - r.top)  / r.height - .5;
        stage.style.setProperty('--px', (nx *  22).toFixed(1) + 'px');
        stage.style.setProperty('--py', (ny *  16).toFixed(1) + 'px');
        stage.style.setProperty('--qx', (nx * -14).toFixed(1) + 'px');
        stage.style.setProperty('--qy', (ny * -10).toFixed(1) + 'px');
      }, {passive:true});
      stage.addEventListener('pointerleave', function(){
        ['--px','--py','--qx','--qy'].forEach(function(k){ stage.style.setProperty(k,'0px') });
      });
    }
    /* магнитные кнопки первого экрана и шапки */
    var mags = root.querySelectorAll('.hero-cta .btn,.hdr .btn-a,.final .btn-acc');
    Array.prototype.forEach.call(mags, function(el){
      el.addEventListener('pointermove', function(e){
        var r = el.getBoundingClientRect();
        el.style.setProperty('--mx', ((e.clientX - r.left - r.width/2)  * .22).toFixed(1) + 'px');
        el.style.setProperty('--my', ((e.clientY - r.top  - r.height/2) * .30).toFixed(1) + 'px');
      }, {passive:true});
      el.addEventListener('pointerleave', function(){
        el.style.setProperty('--mx','0px'); el.style.setProperty('--my','0px');
      });
    });
  })();
  /* ═══════════ КНОПКИ «ПОДАТЬ ЗАЯВКУ»: откуда пришли к форме ═══════════ */
  root.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[href="#apply"]');
    if(!a) return;
    var from = a.closest('.hero') ? 'hero' : a.closest('.mnav') ? 'menu' : a.closest('.hdr') ? 'header'
             : a.closest('.dock') ? 'dock' : a.closest('#final') ? 'final' : 'other';
    emit('cta_click', null, {from: from});
  }, true);
