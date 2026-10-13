  /* ═══════════ COUNTDOWN ═══════════ */
  // при дедлайне форму не удаляем, а гасим: если дедлайн сдвинут вперёд — всё вернётся само
  function isClosed(){
    if(DEBUG) return false;     // ?tt_debug=1: проверка формы после дедлайна, только локально
    return CONFIG.forceClosed || Date.now() > DEADLINE;
  }
  var closedApplied = false;
  function applyClosed(){
    if(closedApplied || !isClosed()) return;
    closedApplied = true;
    root.classList.add('tt-closed');
    var f = document.getElementById('ttForm');
    if(f) f.querySelectorAll('input,select,textarea,button').forEach(function(el){
      el.disabled = true;
    });
    // кнопка не должна обещать того, чего уже нет; _ru и data-en ставим оба,
    // иначе переключение языка вернёт старую подпись
    root.querySelectorAll('a[href="#apply"][data-en]').forEach(function(a){
      a._ru = UI.closedCta.ru;
      a.setAttribute('data-en', UI.closedCta.en);
      a.innerHTML = lang === 'en' ? UI.closedCta.en : a._ru;
    });
    watchClosedView();
  }
  var elD=document.getElementById('ttD'), elH=document.getElementById('ttH'), elM=document.getElementById('ttM'),
      elBar=document.getElementById('ttBar'), elSt=document.getElementById('ttStatus'),
      s1=document.getElementById('ttS1'), s2=document.getElementById('ttS2'),
      elFinal=document.getElementById('ttFinalLeft'), elDockN=document.getElementById('ttDockN');
  function pad(n){ return (n<10?'0':'')+n }
  function tick(){
    var now = Date.now(), left = DEADLINE - now, cd = t('countdown');
    if(left <= 0){
      elD.textContent='00'; elH.textContent='00'; elM.textContent='00';
      elBar.style.transform='scaleX(1)';
      elSt.textContent = cd.closed;
      if(elDockN) elDockN.textContent = '0';
      elFinal.textContent = cd.finalClosed;
      applyClosed();
      return false;
    }
    var mins = Math.floor(left/60000), d = Math.floor(mins/1440), h = Math.floor((mins%1440)/60), m = mins%60;
    elD.textContent = pad(d); elH.textContent = pad(h); elM.textContent = pad(m);
    elSt.textContent = cd.open;
    elBar.style.transform = 'scaleX(' + Math.min(Math.max((now-OPENED)/(DEADLINE-OPENED),0),1).toFixed(4) + ')';
    elFinal.textContent = fmt(cd.left, {d:d, h:h, m:m});
    if(elDockN) elDockN.textContent = d;
    return true;
  }
  function startCountdown(){
    tick();
    var cdTimer = setInterval(function(){ if(tick() === false) clearInterval(cdTimer); }, 1000);
    if(!reduced) setInterval(function(){ s1.classList.toggle('dim'); s2.classList.toggle('dim'); }, 1000);
  }
  startCountdown();
