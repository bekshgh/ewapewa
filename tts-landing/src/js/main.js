  /* ═══════════ ЗАПУСК ═══════════ */
  updateMeter();
  // порядок важен: язык применяем первым, чтобы правка разметки не смогла
  // уронить инициализацию текста и анимаций
  applyLang('ru');
  try{ syncUni() }catch(e){}
  try{ syncReloc() }catch(e){}
  // досрочное закрытие (forceClosed) срабатывает и до дедлайна
  try{ applyClosed() }catch(e){}
  try{ startAnalytics() }catch(e){}
