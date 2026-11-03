/** Registration check: the form's export against the project's leads. */
export const RECONCILE: Record<string, string> = {
  "Registration check": "Сверка регистраций",
  "Compare the form's export (e.g. Zimran's candidate list) with the project's leads on the site: who the site missed, who is only on the site, and whose tags differ.":
    "Сравните выгрузку формы (например, список кандидатов Zimran) с лидами проекта на сайте: кого сайт не записал, кто есть только на сайте и у кого не совпадают метки.",
  "Compare the form's export with the site's leads": "Сравнить выгрузку формы с лидами сайта",
  "Only admins and this project's managers can check its registrations": "Сверять регистрации проекта могут только админы и его менеджеры",

  // settings
  "{n} leads of this project on the site.": "Лидов этого проекта на сайте: {n}.",
  "Choose the form's export (.xlsx, .xls, .csv)": "Выбрать выгрузку формы (.xlsx, .xls, .csv)",
  "The file is read only in your browser: it is not uploaded or saved. People are matched by e-mail, else by phone.":
    "Файл читается только в вашем браузере: он не загружается и не сохраняется. Людей сопоставляем по почте, если её нет — по телефону.",
  phone: "телефон",
  "tag (UTM)": "метка (UTM)",
  "No e-mail or phone column found: pick it by hand.": "Не нашли колонку с почтой или телефоном: выберите её вручную.",
  "No tag column found: pick it to compare channels too.": "Не нашли колонку с меткой: выберите её, чтобы сравнить и каналы.",

  // summary
  "File: {rows} rows, {people} people": "Файл: строк — {rows}, людей — {people}",
  "{n} repeat sends": "повторных отправок: {n}",
  "{n} rows without e-mail or phone": "строк без почты и телефона: {n}",
  "Site: {people} people in the same period": "Сайт: людей за тот же период — {people}",
  "by link {link}, direct {direct}, imported {imported}, webhook {webhook}": "по ссылкам {link}, direct {direct}, импорт {imported}, вебхук {webhook}",
  "{n} more leads outside the file's period are left out": "ещё {n} лидов вне периода файла не учитываются",
  "{n} leads without e-mail or phone": "лидов без почты и телефона: {n}",
  "In both": "Есть и там, и там",
  "{p} of the people in the file": "{p} людей из файла",
  "Only in the file": "Только в файле",
  "Registered in the form, but the site did not record them.": "Зарегистрировались в форме, но сайт их не записал.",
  "Only on the site": "Только на сайте",
  "The site recorded them, but they are not in the export.": "Сайт их записал, но в выгрузке их нет.",
  "Same tag": "Метка совпадает",
  "of the people in both: the channel in the file and on the site agree": "из тех, кто есть и там и там: канал в файле и на сайте один и тот же",
  "The file has no tag column.": "В файле нет колонки с меткой.",

  // tags
  "Tags of the people in both": "Метки у тех, кто есть и там и там",
  "No tag in either": "Без метки и там и там",
  "Tag in the file, direct on the site": "В файле метка, на сайте direct",
  "No tag in the file, a channel on the site": "В файле без метки, на сайте есть канал",
  "Different tags": "Разные метки",
  "Tags differ": "Метки не совпадают",
  "Missing on the site — by the file's tag": "Нет на сайте — по метке в файле",
  "Missing in the file — by the site's channel": "Нет в файле — по каналу на сайте",
  "without a tag": "без метки",
  "Nobody.": "Никого.",
  "Where the tags differ": "Где метки расходятся",
  "The same person: the tag in the file and the channel the site gave them.": "Один и тот же человек: метка в файле и канал, который ему дал сайт.",
  "In the file": "В файле",
  "On the site": "На сайте",
  People: "Людей",

  // by day
  "By day": "По дням",
  "People by the day of their first registration. A day with low coverage shows when the site lost registrations.":
    "Люди по дню первой регистрации. День с низким покрытием показывает, когда сайт терял регистрации.",
  Day: "День",
  Coverage: "Покрытие",

  // people
  "Who exactly": "Кто именно",
  "Search: e-mail, tag": "Поиск: почта, метка",
  Contact: "Контакт",
  Registered: "Зарегистрировался",
  "Tag in the file": "Метка в файле",
  "Channel on the site": "Канал на сайте",

  // why
  "Why the numbers differ": "Почему цифры расходятся",
  "No tag in the form's export": "Нет метки в выгрузке формы",
  "the person opened the form without UTM in the address: typed it, found it in search, or got a link from a teammate or a friend. The site counts such people as direct.":
    "человек открыл форму без UTM в адресе: набрал его сам, нашёл в поиске или получил ссылку от сокомандника или друга. Сайт считает таких людей direct.",
  "the site sees a registration only if its script ran in the person's browser and saw the thank-you screen: an ad blocker, a closed tab or a slow send means no lead. A direct registration is also skipped when the script could not read an e-mail or phone, and after 10 from one network in an hour.":
    "сайт видит регистрацию, только если его скрипт сработал в браузере человека и увидел экран «Спасибо»: блокировщик рекламы, закрытая вкладка или долгая отправка — и лида нет. Регистрация без ссылки (direct) ещё пропускается, если скрипт не смог прочитать почту или телефон, и после 10 заявок из одной сети за час.",
  "leads after the export was made, test sends, or a different e-mail in the form and on the site.":
    "лиды, пришедшие после выгрузки, тестовые отправки или разная почта в форме и на сайте.",
  "the site keeps the link's tags for a day and trusts the link a person came through; the form may remember an earlier or a later visit.":
    "сайт хранит метки ссылки сутки и верит ссылке, по которой человек пришёл; форма может запомнить более ранний или более поздний визит.",
  "Repeat sends: the form keeps every one, the site merges repeats from one visit. Here both are counted as people.":
    "Повторные отправки: форма хранит каждую, сайт склеивает повторы в рамках одного визита. Здесь и там считаем людей.",
};
