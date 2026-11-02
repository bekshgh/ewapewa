/** Attendance forecast (beta). */
export const FORECAST: Record<string, string> = {
  Beta: "Бета",
  "Attendance forecast": "Прогноз явки",
  "Admins and project managers only": "Только для админов и менеджеров проектов",
  "Beta: the model was trained on one past Business Cup. Use the forecast as a guide and check decisions against participants' answers in the bot.":
    "Бета-версия: модель обучена на одном прошлом Business Cup. Используйте прогноз как ориентир, а решения сверяйте с ответами участников в боте.",

  // source and settings
  "Source:": "Источник:",
  "Project data on the site": "Данные проекта на сайте",
  "Upload a registration sheet": "Загрузить рег-шит",
  "Registration deadline": "Дедлайн регистрации",
  "Saved for {project}.": "Сохранено для {project}.",
  "People needed at the event": "Сколько людей нужно на событии",
  "Invite by ICP segment (P0 → P1 → P2)": "Приглашать по сегментам ICP (P0 → P1 → P2)",
  "the data has no segments": "в данных нет сегментов",
  "Reading…": "Читаю…",
  "Choose another file": "Выбрать другой файл",
  "Choose a file (.xlsx, .xls, .csv)": "Выбрать файл (.xlsx, .xls, .csv)",
  "Download template": "Скачать шаблон",
  "The file is read only in your browser: it is not uploaded or saved. Headers in the first row, one row per registration; column order does not matter.":
    "Файл читается только в вашем браузере: он не загружается на сервер и не сохраняется. Заголовки в первой строке, одна строка на заявку; порядок колонок не важен.",
  "The file has no rows.": "В файле нет строк.",
  "Could not read the file: {error}": "Не удалось прочитать файл: {error}",
  Sheet: "Лист",
  "Required columns not found: {fields}. Pick them by hand or rename the headers.":
    "Не найдены обязательные колонки: {fields}. Выберите их вручную или переименуйте заголовки.",
  "— pick a column —": "— выберите колонку —",
  "no: {field}": "нет: {field}",
  "registration date": "дата заявки",
  "participation type": "тип участия",
  university: "вуз",
  "year of study": "курс",
  "e-mail": "почта",
  team: "команда",
  major: "специальность",
  Zimran: "Zimran",
  "past AIESEC project": "прошлый проект AIESEC",
  "ICP segment": "сегмент ICP",
  name: "имя",
  Telegram: "Telegram",
  "{n} registrations of this project on the site (its own campaign's leads).": "Заявок проекта на сайте: {n} (лиды его основной кампании).",
  "The site's registrations lack some form answers, so the chance to come is rougher. For a sharper forecast upload the registration sheet or import it in Data.":
    "У заявок на сайте не хватает части ответов формы, поэтому шанс прийти считается грубее. Для точного прогноза загрузите рег-шит или импортируйте его в разделе Data.",

  // states
  "Set the registration deadline to see the forecast.": "Укажите дедлайн регистрации, чтобы увидеть прогноз.",
  "Counting…": "Считаю…",
  "No registrations yet: nothing to forecast.": "Заявок пока нет: прогнозировать нечего.",
  "{n} unique registrations": "Уникальных заявок: {n}",
  "{n} repeats by e-mail dropped": "убрано повторов по почте: {n}",
  "last one {time}": "последняя {time}",
  "Too little data for a forecast: fewer than 50 registrations. Treat the numbers as a rough guide.":
    "Мало данных для прогноза: меньше 50 заявок. Считайте цифры грубым ориентиром.",

  // tiles
  "Registrations by the deadline": "Регистраций к дедлайну",
  "Registration closed": "Регистрация закрыта",
  "The deadline {date} has passed: {n} registrations in the end.": "Дедлайн {date} прошёл, итог — {n}.",
  "Now {n}; {days} left until the deadline {date}. Usual pace: {pace} a day.": "Сейчас {n}, до дедлайна {date} осталось {days}. Обычный темп {pace} в день.",
  "Will come of those registered so far": "Придут из тех, кто уже зарегистрировался",
  "turnout {p}": "явка {p}",
  "If all {n} are invited. By the deadline, with ~{final} registrations, it would be about {come}.":
    "Если позвать всех {n}. К дедлайну, при ~{final} заявках, это было бы около {come}.",
  "If all {n} are invited.": "Если позвать всех {n}.",
  "Invite to get {n} people": "Пригласить, чтобы пришло {n}",
  "will come ≈": "придут ≈",
  "The likeliest by the model, segments not taken into account.": "Самые вероятные по модели, без учёта сегментов.",
  "Not enough": "Не хватает",
  "even all {n} give ≈": "даже все {n} дадут ≈",
  "More registrations or a smaller target are needed.": "Нужно больше регистраций или меньшая цель.",

  // chart
  "Registrations by day": "Регистрации по дням",
  Actual: "Факт",
  "Forecast (base)": "Прогноз (база)",
  Range: "Диапазон",
  "Registrations by day: actual and forecast up to the deadline": "Регистрации по дням: факт и прогноз до дедлайна",
  deadline: "дедлайн",
  today: "сегодня",
  "{date}: forecast +{n} (from {low} to {high})": "{date}: прогноз +{n} (от {low} до {high})",
  "Registration is closed: only the actual numbers are shown.": "Регистрация закрыта, показан только факт.",
  "Today's bar is not complete: the forecast shows how many more will come by the end of the day. The biggest jump is usually on the deadline day.":
    "Сегодняшний столбец неполный: прогноз показывает, сколько ещё добавится до конца дня. Самый большой всплеск обычно в день дедлайна.",

  // segments
  "Turnout by ICP segment": "Явка по сегментам ICP",
  "Turnout by participation type": "Явка по статусу участия",
  "The data has no ICP segments (Screening column), so the plan picks the likeliest people.":
    "В данных нет сегментов ICP (колонка Screening), поэтому план берёт самых вероятных.",
  Participation: "Статус",
  "Will come": "Придут",
  Turnout: "Явка",
  "If you invite P0 + P1": "Если позвать P0 + P1",
  "No segment": "Без сегмента",
  "In a team": "В команде",
  Solo: "Соло",
  "Looking for a team": "Ищут команду",

  // participants
  "Participants and their chance to come": "Участники и их шанс прийти",
  "{n} of {total} · admins only": "{n} из {total} · видят только админы",
  "Search: name, team, university": "Поиск: имя, команда, вуз",
  "All segments": "Все сегменты",
  "Chance to come": "Шанс прийти",
  "Any chance": "Любой шанс",
  "High ≥60%": "Высокий ≥60%",
  "Medium 40–60%": "Средний 40–60%",
  "Low <40%": "Низкий <40%",
  Chance: "Шанс",
  Participant: "Участник",
  "Export CSV": "Экспорт CSV",
  "Show more": "Показать ещё",

  // how it works
  "How it is calculated": "Как считается",
  "from a model trained on Business Cup S26: 1 018 invited people and their day-1 check-in. It looks at team status and size, university, year, major, interest in Zimran, past AIESEC projects and how close to the deadline the person registered. In testing it got the total turnout right (601 of 601), but is often wrong about a single person.":
    "даёт модель, обученная на Business Cup S26: 1 018 приглашённых и их чек-ин в первый день. Учитываются статус в команде и её размер, вуз, курс, специальность, интерес к Zimran, прошлые проекты AIESEC и то, как близко к дедлайну человек зарегистрировался. На проверке модель угадала общее число пришедших точно (601 из 601), но про отдельного человека ошибается часто.",
  "How many will come": "Сколько придёт",
  "the sum of the chances. The range is wider than for coin tosses, because teams come or stay away together.":
    "сумма шансов. Диапазон шире, чем при подбрасывании монетки, потому что команды приходят или не приходят вместе.",
  "from the shape of the final week of past projects: in their last 7 days 1.9× (Creative One), 2.7× (Higgsfield) and 4.1× (Business Cup S26) as many people registered as in the 7 days before. The base is Higgsfield.":
    "считаются по форме последней недели прошлых проектов: за последние 7 дней регистрировались в 1,9 раза (Creative One), 2,7 раза (Higgsfield) и 4,1 раза (Business Cup S26) больше людей, чем за 7 дней до этого. База — Higgsfield.",
  "How many to invite": "Сколько пригласить",
  "people are sorted by ICP segment (P0 → P1 → P2), then by chance, and taken until the expected turnout reaches the target. Better to invite whole teams.":
    "люди сортируются по сегменту ICP (P0 → P1 → P2), внутри — по шансу, и берутся, пока ожидаемая явка не дойдёт до нужного числа. Приглашать лучше командами целиком.",
  "The model does not know about confirmations in the bot or calls. A «coming / not coming» answer beats any estimate, so after the survey trust it.":
    "Модель не знает про подтверждение в боте и обзвон. Ответ «приду / не приду» точнее любой оценки, поэтому после опроса доверяйте ему.",
  "The file is read only in your browser and is not sent anywhere.": "Файл обрабатывается только в вашем браузере и никуда не отправляется.",
  "Model {version} · {trainedOn}": "Модель {version} · {trainedOn}",
};
