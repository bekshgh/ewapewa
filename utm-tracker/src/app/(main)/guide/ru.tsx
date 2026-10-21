import { Code, Note, Section, type GuideSection } from "./parts";

const Tip = ({ children }: { children: React.ReactNode }) => <Note kind="tip" label="Совет.">{children}</Note>;
const Warn = ({ children }: { children: React.ReactNode }) => <Note kind="warn" label="Важно.">{children}</Note>;
const Fix = ({ children }: { children: React.ReactNode }) => <Note kind="fix" label="Если не работает.">{children}</Note>;

export const SECTIONS: GuideSection[] = [
  { id: "utm", n: 1, t: "UTM-метки простыми словами" },
  { id: "why", n: 2, t: "Зачем трекер" },
  { id: "click", n: 3, t: "Что такое клик" },
  { id: "lead", n: 4, t: "Что такое лид" },
  { id: "conversion", n: 5, t: "Что такое конверсия" },
  { id: "first-link", n: 6, t: "Как создать ссылки" },
  { id: "source", n: 7, t: "Как выбрать utm_source" },
  { id: "medium", n: 8, t: "Как выбрать utm_medium" },
  { id: "campaign", n: 9, t: "Как назвать utm_campaign" },
  { id: "content-term", n: 10, t: "utm_content и utm_term" },
  { id: "where", n: 11, t: "Куда ставить ссылку" },
  { id: "tilda", n: 12, t: "Как подключить Tilda" },
  { id: "webhook", n: 13, t: "Дополнительно: вебхук Tilda" },
  { id: "fields", n: 14, t: "Поля формы" },
  { id: "clickid", n: 15, t: "Зачем нужен click_id" },
  { id: "check", n: 16, t: "Как проверить, что всё работает" },
  { id: "read", n: 17, t: "Как читать аналитику" },
  { id: "mistakes", n: 18, t: "Частые ошибки" },
  { id: "examples", n: 19, t: "Примеры хороших ссылок" },
  { id: "checklist", n: 20, t: "Чек-лист перед запуском рекламы" },
];

/** The guide in Russian: the same sections as en.tsx. */
export function Body() {
  return (
    <>
      <Section id="utm" n={1} title="UTM-метки простыми словами">
        <p>UTM-метки — это подписи к ссылке, по которым потом видно, откуда пришёл человек. Ссылка работает как обычно, а метки просто попадают в статистику.</p>
        <p>Пример: вы публикуете ссылку в Instagram и в Telegram. Ссылки почти одинаковые, но благодаря меткам видно, что из Instagram пришло 80 человек, а из Telegram — 200.</p>
        <p>Меток пять: <Code>utm_source</Code> (откуда), <Code>utm_medium</Code> (каким способом), <Code>utm_campaign</Code> (какая кампания), <Code>utm_content</Code> (какой именно пост или размещение) и <Code>utm_term</Code> (ключевое слово или аудитория, в основном для рекламы).</p>
      </Section>

      <Section id="why" n={2} title="Зачем трекер">
        <p>Без трекера видно общее число регистраций, но не видно, какой канал их привёл. Трекер связывает каждый клик с каждым лидом и показывает, какая ссылка действительно приводит людей, а какая только отнимает время.</p>
        <Tip>Так вы не тратите бюджет зря: вкладываетесь в то, что работает, и выключаете то, что нет.</Tip>
      </Section>

      <Section id="click" n={3} title="Что такое клик">
        <p>Клик — это когда кто-то открыл вашу ссылку. EwA Tracker считает клики на сервере в момент перехода, поэтому блокировщики рекламы и выключенный JavaScript на подсчёт не влияют.</p>
        <p>Мы различаем <strong>уникальные</strong> клики (разные люди) и <strong>повторные</strong> (один человек открыл ссылку несколько раз).</p>
      </Section>

      <Section id="lead" n={4} title="Что такое лид">
        <p>Лид — это человек, который зарегистрировался: заполнил форму на лендинге и оставил имя, телефон или e-mail. Клик — это интерес, лид — действие.</p>
      </Section>

      <Section id="conversion" n={5} title="Что такое конверсия">
        <p>Конверсия (CR) — доля тех, кто кликнул и потом зарегистрировался: <Code>лиды ÷ уникальные клики × 100%</Code>.</p>
        <p>Пример: 100 уникальных кликов и 13 регистраций = конверсия 13%. Чем она выше, тем лучше работает связка «канал → страница».</p>
      </Section>

      <Section id="first-link" n={6} title="Как создать ссылки">
        <p><strong>Все ссылки проекта сразу:</strong> откройте кампанию и нажмите <strong>Создать UTM-ссылки</strong>. Укажите код проекта (например, <Code>tts</Code>) и страницу назначения, выберите шаблон «Project set» или «Как в другой кампании», поправьте строки и нажмите <strong>Создать</strong>. Получатся ссылки вида <Code>/r/tts-ig-tapter</Code> — их можно скопировать или скачать CSV.</p>
        <p><strong>Одна ссылка:</strong> откройте <strong>Создать ссылку</strong> и заполните:</p>
        <ol className="ml-5 list-decimal space-y-1">
          <li>Описание — для вас и команды (например, «Сторис в Instagram, 30 мая»).</li>
          <li>Куда ведёт ссылка — обычно страница на Tilda.</li>
          <li>Источник, канал, кампания — выберите из списков.</li>
          <li>Контент — конкретное размещение (story_may30, bio_link).</li>
          <li>Нажмите <strong>Создать ссылку</strong> — получится короткая ссылка вида <Code>/r/abc123</Code>.</li>
        </ol>
        <Tip>Справа сразу видно короткую ссылку и полный адрес с метками.</Tip>
      </Section>

      <Section id="source" n={7} title="Как выбрать utm_source">
        <p>Источник — это площадка, <em>откуда</em> пришёл трафик. Пишите название площадки, а не тип: <Code>instagram</Code>, <Code>telegram</Code>, <Code>email</Code>, <Code>youtube</Code>.</p>
        <Warn>Пишите всегда одинаково. <Code>instagram</Code> и <Code>Instagram</Code> считаются двумя разными источниками.</Warn>
      </Section>

      <Section id="medium" n={8} title="Как выбрать utm_medium">
        <p>Канал — это <em>каким способом</em> человек попал на ссылку:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li><Code>social</Code> — обычный пост или сторис;</li>
          <li><Code>bio</Code> — ссылка в профиле;</li>
          <li><Code>message</Code> — личное сообщение или рассылка в чате;</li>
          <li><Code>cpc</Code> — платная реклама;</li>
          <li><Code>email</Code> — e-mail-рассылка;</li>
          <li><Code>referral</Code> — ссылка партнёра;</li>
          <li><Code>offline</Code> — QR-код, постер, баннер.</li>
        </ul>
      </Section>

      <Section id="campaign" n={9} title="Как назвать utm_campaign">
        <p>Кампания — это название всей активности. Строчными буквами, без пробелов, понятно: <Code>icy_s26</Code>, <Code>toptalentssprint_f26</Code>.</p>
        <Tip>Если добавить сезон или год, кампанию потом легко найти.</Tip>
      </Section>

      <Section id="content-term" n={10} title="utm_content и utm_term">
        <p><Code>utm_content</Code> различает <em>разные размещения внутри одной кампании</em>: <Code>tapter</Code>, <Code>rassylka</Code>, <Code>infopartner1</Code>. Так видно, какой именно пост или партнёр сработал.</p>
        <p><Code>utm_term</Code> нужен в основном для рекламы — ключевое слово или аудитория: <Code>youth_almaty</Code>. Необязательно.</p>
      </Section>

      <Section id="where" n={11} title="Куда ставить ссылку">
        <p>Короткую ссылку <Code>/r/...</Code> можно ставить куда угодно:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li><strong>Instagram</strong> — ссылка в профиле или в сторис;</li>
          <li><strong>Telegram</strong> — пост, закреп или рассылка;</li>
          <li><strong>E-mail</strong> — кнопка в рассылке;</li>
          <li><strong>Реклама</strong> — как целевой адрес;</li>
          <li><strong>Офлайн</strong> — в QR-коде на постере или баннере.</li>
        </ul>
        <Warn>Всегда раздавайте короткую ссылку трекера, а не прямую ссылку на Tilda. Иначе клик не посчитается.</Warn>
      </Section>

      <Section id="tilda" n={12} title="Как подключить Tilda">
        <p>Как это работает: короткая ссылка → клик считается здесь → человек попадает на Tilda → заполняет форму → лид считается здесь.</p>
        <ol className="ml-5 list-decimal space-y-1">
          <li>Укажите адрес страницы на Tilda как адрес назначения ссылки (или как страницу назначения в «Создать UTM-ссылки»).</li>
          <li>В Tilda: <strong>Настройки сайта → Вставка кода → HEAD</strong>, вставьте одну строку со вкладки <strong>Вебхук</strong> (<Code>&lt;script src=&quot;…/t.js&quot; async&gt;&lt;/script&gt;</Code>), сохраните и переопубликуйте все страницы.</li>
          <li>Всё: один раз на сайт Tilda, а не на каждую страницу или ссылку. Если лендинг проекта — на отдельном сайте Tilda, строка нужна и там.</li>
        </ol>
        <p>
          Эта же строка включает раздел <strong>Формы</strong>: каждая форма на каждой странице сайта появится там сама после первого посетителя — где люди бросают
          форму, на каких вопросах застревают, что мешает «Отправить». Введённые ответы не сохраняются, только заполнено ли поле. Форма привязывается к проекту,
          чьи ссылки ведут на эту страницу (иначе — к utm_campaign посетителя); поменять можно на странице формы. Чтобы проверить страницу самому и не испортить
          цифры, откройте её с <Code>?tt_debug=1</Code>: визит пометится как тестовый.
        </p>
      </Section>

      <Section id="webhook" n={13} title="Дополнительно: вебхук Tilda">
        <p>Скрипт выше уже считает лиды. Вебхук — это дополнительный серверный канал: Tilda присылает нам данные формы сразу после отправки. Вместе они никогда не посчитают лид дважды.</p>
        <ol className="ml-5 list-decimal space-y-1">
          <li>В Tilda откройте форму → <strong>Настройки → Приём данных</strong>.</li>
          <li>Добавьте сервис <strong>Webhook</strong>.</li>
          <li>Вставьте адрес со вкладки <strong>Вебхук</strong> трекера.</li>
          <li>Добавьте заголовок <Code>X-Webhook-Secret</Code> с секретом. Если заголовок добавить нельзя, допишите к адресу <Code>?secret=ВАШ_СЕКРЕТ</Code> — это работает, но адреса попадают в логи сервера, поэтому заголовок надёжнее.</li>
          <li>Без секрета запрос (и «Отправить тест») получит ошибку 401.</li>
          <li>Сохраните и нажмите «Отправить тест».</li>
        </ol>
      </Section>

      <Section id="fields" n={14} title="Поля формы">
        <p>Видимые поля (имя, телефон, e-mail) остаются как есть. Скрытые поля скрипт добавит сам: <Code>click_id</Code>, <Code>utm_source</Code>, <Code>utm_medium</Code>, <Code>utm_campaign</Code>, <Code>utm_content</Code>, <Code>utm_term</Code>.</p>
        <Tip>Вручную ничего создавать не нужно — скрипт берёт значения из адресной строки.</Tip>
      </Section>

      <Section id="clickid" n={15} title="Зачем нужен click_id">
        <p><Code>click_id</Code> — уникальный код одного клика. Мы сами добавляем его к адресу Tilda. Когда форма передаёт его обратно, мы точно знаем, какой клик привёл человека.</p>
        <Warn>С <Code>click_id</Code> атрибуция <strong>точная</strong>. Без него мы угадываем по UTM и времени — <strong>примерно</strong>, это менее надёжно.</Warn>
      </Section>

      <Section id="check" n={16} title="Как проверить, что всё работает">
        <ol className="ml-5 list-decimal space-y-1">
          <li>Откройте свою короткую ссылку — на дашборде появится клик.</li>
          <li>Проверьте, что в адресе Tilda теперь есть <Code>?...&click_id=clk_...</Code>.</li>
          <li>Заполните форму на Tilda тестовыми данными и отправьте.</li>
          <li>В разделе <strong>Лиды</strong> появится лид со статусом <strong>точно</strong>.</li>
        </ol>
        <Fix>Нет клика — раздали прямую ссылку на Tilda вместо короткой. Нет лида — на этом сайте Tilda нет строки <Code>/t.js</Code> или страницу не переопубликовали после её добавления. «Примерно» вместо «точно» — посетитель пришёл не по короткой ссылке.</Fix>
      </Section>

      <Section id="read" n={17} title="Как читать аналитику">
        <p><strong>Всего кликов</strong> — все переходы. <strong>Уникальные клики</strong> — разные люди. <strong>Лиды</strong> — регистрации. <strong>Конверсия</strong> — лиды ÷ уникальные клики: доля разных людей, которые открыли ссылку и потом зарегистрировались.</p>
        <p>Таблицы «По источникам / кампаниям / контенту» показывают, какой канал и какое размещение приводят больше всего лидов. Смотрите на <strong>конверсию</strong>, а не на клики: канал с меньшим числом кликов иногда приводит больше регистраций.</p>
      </Section>

      <Section id="mistakes" n={18} title="Частые ошибки">
        <ul className="ml-5 list-disc space-y-1">
          <li>Раздают прямую ссылку на Tilda вместо короткой <Code>/r/...</Code> — клики не считаются.</li>
          <li>Пишут источник по-разному: <Code>tg</Code>, <Code>telegram</Code>, <Code>Telegram</Code> — данные распадаются.</li>
          <li>На сайте Tilda лендинга нет строки <Code>/t.js</Code> — лиды не считаются.</li>
          <li>Вебхук без секрета — события приходят как «без доступа».</li>
          <li>Пробелы и заглавные буквы в utm_campaign — метки читаются по-разному.</li>
        </ul>
      </Section>

      <Section id="examples" n={19} title="Примеры хороших ссылок">
        <div className="space-y-3">
          <Code>https://your-page.tilda.ws?utm_source=instagram&utm_medium=bio&utm_campaign=toptalentssprint_f26&utm_content=tapter</Code>
          <Code>https://your-page.tilda.ws?utm_source=telegram&utm_medium=message&utm_campaign=toptalentssprint_f26&utm_content=rassylka</Code>
          <Code>https://your-page.tilda.ws?utm_source=email&utm_medium=email&utm_campaign=toptalentssprint_f26&utm_content=mailing</Code>
        </div>
        <Tip>Собирать такие ссылки вручную не нужно — трекер сам добавляет метки, когда открывают короткую ссылку.</Tip>
      </Section>

      <Section id="checklist" n={20} title="Чек-лист перед запуском рекламы">
        <ul className="space-y-2">
          {[
            "Кампания есть в разделе «Кампании»",
            "Ссылки созданы («Создать UTM-ссылки» на странице кампании)",
            "Ссылки ведут на нужную страницу Tilda",
            "Строка /t.js стоит в «Вставка кода → HEAD» этого сайта Tilda, страницы переопубликованы",
            "Тестовая регистрация по короткой ссылке появилась в «Лидах» со статусом «точно»",
            "Раздаются только короткие ссылки /r/…, никогда не прямая ссылка на Tilda",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 rounded-xl border border-line bg-bg-base px-4 py-3 text-sm text-ink-muted">
              <span className="mt-0.5 text-leads">✓</span>{item}
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
