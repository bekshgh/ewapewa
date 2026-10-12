import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "Гайдлайн — EwA Tracker" };

const SECTIONS = [
  { id: "utm", n: 1, t: "Что такое UTM-метки простыми словами" },
  { id: "why", n: 2, t: "Зачем нужен трекер" },
  { id: "click", n: 3, t: "Что такое клик" },
  { id: "lead", n: 4, t: "Что такое лид" },
  { id: "conversion", n: 5, t: "Что такое конверсия" },
  { id: "first-link", n: 6, t: "Как создать первую ссылку" },
  { id: "source", n: 7, t: "Как выбрать utm_source" },
  { id: "medium", n: 8, t: "Как выбрать utm_medium" },
  { id: "campaign", n: 9, t: "Как назвать utm_campaign" },
  { id: "content-term", n: 10, t: "utm_content и utm_term" },
  { id: "where", n: 11, t: "Куда вставлять ссылку" },
  { id: "tilda", n: 12, t: "Как подключить Tilda" },
  { id: "webhook", n: 13, t: "Как настроить webhook в Tilda" },
  { id: "fields", n: 14, t: "Какие поля передавать из Tilda" },
  { id: "clickid", n: 15, t: "Почему важно передавать click_id" },
  { id: "check", n: 16, t: "Как проверить, что всё работает" },
  { id: "read", n: 17, t: "Как читать аналитику" },
  { id: "mistakes", n: 18, t: "Частые ошибки" },
  { id: "examples", n: 19, t: "Примеры правильных ссылок" },
  { id: "checklist", n: 20, t: "Чеклист перед запуском рекламы" },
];

function Section({ id, n, title, children }: { id: string; n: number; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line py-8 first:border-t-0 first:pt-0">
      <h2 className="font-display text-2xl font-bold">
        <span className="mr-2 text-accent">{n}.</span>{title}
      </h2>
      <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-leads/30 bg-leads/5 p-4 text-sm text-ink-muted"><strong className="text-leads">💡 Совет. </strong>{children}</div>;
}
function Warn({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm text-ink-muted"><strong className="text-accent">⚠️ Важно. </strong>{children}</div>;
}
function Fix({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-line bg-bg-base p-4 text-sm text-ink-muted"><strong className="text-ink">🛠 Если не работает. </strong>{children}</div>;
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-bg-base px-1.5 py-0.5 text-[13px] text-clicks">{children}</code>;
}

export default function GuidePage() {
  return (
    <>
      <PageHeader breadcrumb="Гайдлайн" title="Гайд для новичков" subtitle="Пошагово и простым языком: от первой ссылки до чтения аналитики." />

      <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
        {/* nav */}
        <nav className="hidden lg:block lg:sticky lg:top-8 lg:self-start">
          <p className="mb-3 text-xs uppercase tracking-wide text-ink-faint">Содержание</p>
          <ol className="space-y-1 text-sm">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-lg px-2 py-1 text-ink-muted transition hover:bg-bg-raised hover:text-ink">
                  <span className="text-ink-faint">{s.n}.</span> {s.t}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* content */}
        <article className="max-w-2xl">
          <Section id="utm" n={1} title="Что такое UTM-метки простыми словами">
            <p>UTM-метки — это «бирки», которые мы приклеиваем к ссылке, чтобы потом понять, откуда пришёл человек. Сама ссылка работает как обычно, а метки просто записываются в статистику.</p>
            <p>Пример: вы выложили ссылку в Instagram и в Telegram. По виду они почти одинаковые, но с метками вы увидите, что 80 человек пришли из Instagram, а 200 — из Telegram.</p>
            <p>Метки бывают пяти видов: <Code>utm_source</Code> (откуда), <Code>utm_medium</Code> (каким способом), <Code>utm_campaign</Code> (какая кампания), <Code>utm_content</Code> (какое конкретное объявление/пост), <Code>utm_term</Code> (ключевое слово, обычно для рекламы).</p>
          </Section>

          <Section id="why" n={2} title="Зачем нужен трекер">
            <p>Без трекера вы видите общее число заявок, но не знаете, какой канал их принёс. Трекер связывает каждый клик с каждой заявкой и показывает, какая ссылка реально приводит людей, а какая просто тратит время.</p>
            <Tip>Это помогает не сливать бюджет: вы вкладываетесь в то, что работает, и отключаете то, что не работает.</Tip>
          </Section>

          <Section id="click" n={3} title="Что такое клик">
            <p>Клик — это когда человек нажал на вашу ссылку. EwA Tracker считает клики на сервере в момент перехода, поэтому блокировщики рекламы и отключённый JavaScript не мешают подсчёту.</p>
            <p>Мы отличаем <strong>уникальные</strong> клики (разные люди) от <strong>повторных</strong> (один человек нажал несколько раз).</p>
          </Section>

          <Section id="lead" n={4} title="Что такое лид">
            <p>Лид — это человек, который оставил заявку: заполнил форму на Tilda, оставил имя, телефон или почту. Клик — это интерес, лид — это уже действие.</p>
          </Section>

          <Section id="conversion" n={5} title="Что такое конверсия">
            <p>Конверсия (CR, conversion rate) — какой процент кликнувших оставил заявку. Формула простая: <Code>лиды ÷ клики × 100%</Code>.</p>
            <p>Пример: 100 кликов и 13 заявок = конверсия 13%. Чем выше — тем лучше работает связка «канал → страница».</p>
          </Section>

          <Section id="first-link" n={6} title="Как создать первую ссылку">
            <p>Откройте вкладку <strong>Create link</strong> и заполните по шагам:</p>
            <ol className="ml-5 list-decimal space-y-1">
              <li>Описание — для себя и команды (например «Instagram сторис, 30 мая»).</li>
              <li>Destination URL — куда ведём, обычно страница Tilda.</li>
              <li>Source, Medium, Campaign — выбираете из списков.</li>
              <li>Content — конкретное место (story_may30, bio_link).</li>
              <li>Нажимаете <strong>Create link</strong> — получаете короткую ссылку вида <Code>/r/abc123</Code>.</li>
            </ol>
            <Tip>Справа в реальном времени видно, как будет выглядеть короткая ссылка и полный URL с метками.</Tip>
          </Section>

          <Section id="source" n={7} title="Как выбрать utm_source">
            <p>Source — это конкретная площадка, <em>откуда</em> идёт трафик. Пишите название площадки, а не тип: <Code>instagram</Code>, <Code>telegram</Code>, <Code>email</Code>, <Code>youtube</Code>.</p>
            <Warn>Используйте всегда одинаковое написание. <Code>instagram</Code> и <Code>Instagram</Code> система посчитает как два разных источника.</Warn>
          </Section>

          <Section id="medium" n={8} title="Как выбрать utm_medium">
            <p>Medium — это <em>способ</em>, которым человек попал по ссылке:</p>
            <ul className="ml-5 list-disc space-y-1">
              <li><Code>social</Code> — обычный пост или сторис;</li>
              <li><Code>cpc</Code> — платная реклама;</li>
              <li><Code>email</Code> — рассылка;</li>
              <li><Code>referral</Code> — ссылка у партнёра;</li>
              <li><Code>offline</Code> — QR-код, плакат, баннер.</li>
            </ul>
          </Section>

          <Section id="campaign" n={9} title="Как назвать utm_campaign">
            <p>Campaign — название всей рекламной активности. Пишите без пробелов, маленькими буквами, с понятным смыслом: <Code>icy_s26</Code>, <Code>summer_sale_2026</Code>.</p>
            <Tip>Удобно добавлять сезон/год — потом легко найти кампанию в списке.</Tip>
          </Section>

          <Section id="content-term" n={10} title="utm_content и utm_term">
            <p><Code>utm_content</Code> различает <em>разные креативы внутри одной кампании</em>: <Code>story_may30</Code>, <Code>post_video</Code>, <Code>bio_link</Code>. Так вы поймёте, какой именно пост сработал.</p>
            <p><Code>utm_term</Code> нужен в основном для платной рекламы — ключевое слово или аудитория: <Code>youth_almaty</Code>. Необязательный.</p>
          </Section>

          <Section id="where" n={11} title="Куда вставлять ссылку">
            <p>Короткую ссылку <Code>/r/...</Code> можно ставить куда угодно:</p>
            <ul className="ml-5 list-disc space-y-1">
              <li><strong>Instagram</strong> — в шапку профиля (link in bio) или в сторис;</li>
              <li><strong>Telegram</strong> — в пост или закреп;</li>
              <li><strong>Email</strong> — в кнопку рассылки;</li>
              <li><strong>Реклама</strong> — как целевой URL;</li>
              <li><strong>Офлайн</strong> — зашейте её в QR-код на плакате.</li>
            </ul>
            <Warn>Всегда делитесь именно короткой ссылкой трекера, а не прямой ссылкой на Tilda. Иначе клик не посчитается.</Warn>
          </Section>

          <Section id="tilda" n={12} title="Как подключить Tilda">
            <p>Tilda — это страница, где человек оставляет заявку. Логика такая: короткая ссылка → клик считается у нас → человек попадает на Tilda → заполняет форму → Tilda присылает нам данные.</p>
            <ol className="ml-5 list-decimal space-y-1">
              <li>В поле Destination URL при создании ссылки укажите адрес вашей страницы Tilda.</li>
              <li>На страницу Tilda добавьте наш JS-сниппет (см. вкладку Webhook).</li>
              <li>Настройте webhook в форме Tilda.</li>
            </ol>
          </Section>

          <Section id="webhook" n={13} title="Как настроить webhook в Tilda">
            <p>Webhook — это автоматическое сообщение, которое Tilda отправляет нам сразу после заполнения формы.</p>
            <ol className="ml-5 list-decimal space-y-1">
              <li>В Tilda откройте форму → <strong>Настройки → Сбор данных (Data capture)</strong>.</li>
              <li>Добавьте сервис <strong>Webhook</strong>.</li>
              <li>Вставьте URL из вкладки <strong>Webhook</strong> нашего трекера.</li>
              <li>Добавьте заголовок <Code>X-Webhook-Secret</Code> со значением секрета. Если заголовок добавить нельзя, допишите к URL <Code>?secret=ВАШ_СЕКРЕТ</Code> — это работает, но адреса попадают в логи серверов, поэтому заголовок надёжнее.</li>
              <li>Без секрета запрос (и «Отправить тест») получит ошибку 401.</li>
              <li>Сохраните и нажмите «Отправить тест».</li>
            </ol>
          </Section>

          <Section id="fields" n={14} title="Какие поля передавать из Tilda">
            <p>Видимые поля формы (имя, телефон, почта) — как обычно. Скрытые поля добавит наш сниппет автоматически: <Code>click_id</Code>, <Code>utm_source</Code>, <Code>utm_medium</Code>, <Code>utm_campaign</Code>, <Code>utm_content</Code>, <Code>utm_term</Code>.</p>
            <Tip>Ничего вручную создавать не нужно — сниппет сам подставит значения из адресной строки.</Tip>
          </Section>

          <Section id="clickid" n={15} title="Почему важно передавать click_id">
            <p><Code>click_id</Code> — это уникальный код конкретного клика. Мы добавляем его в ссылку на Tilda автоматически. Когда форма возвращает его обратно, мы точно знаем, какой клик привёл этого человека.</p>
            <Warn>С <Code>click_id</Code> привязка <strong>точная</strong> (exact). Без него мы угадываем по UTM и времени — это <strong>оценочная</strong> привязка (estimated), она менее надёжна.</Warn>
          </Section>

          <Section id="check" n={16} title="Как проверить, что всё работает">
            <ol className="ml-5 list-decimal space-y-1">
              <li>Откройте свою короткую ссылку — в Dashboard должен появиться клик.</li>
              <li>Проверьте, что в адресе Tilda появился <Code>?...&click_id=clk_...</Code>.</li>
              <li>Заполните форму на Tilda тестовыми данными.</li>
              <li>Во вкладке <strong>Leads</strong> появится лид со статусом <strong>exact</strong>.</li>
              <li>Во вкладке <strong>Webhook</strong> событие будет со статусом <strong>success</strong>.</li>
            </ol>
            <Fix>Нет клика — вы поделились прямой ссылкой Tilda вместо короткой. Нет лида — проверьте URL webhook и секрет. Статус estimated вместо exact — сниппет не подставил click_id, проверьте, что он добавлен на страницу.</Fix>
          </Section>

          <Section id="read" n={17} title="Как читать аналитику">
            <p><strong>Total clicks</strong> — все переходы. <strong>Unique clicks</strong> — разные люди. <strong>Total leads</strong> — заявки. <strong>Conversion rate</strong> — заявки ÷ уникальные клики: какая доля разных людей, перешедших по ссылке, оставила заявку.</p>
            <p>Таблицы «By source / campaign / content» показывают, какой канал и какой креатив приносят больше всего лидов. Смотрите не на клики, а на <strong>конверсию</strong>: иногда канал с меньшим числом кликов даёт больше заявок.</p>
          </Section>

          <Section id="mistakes" n={18} title="Частые ошибки">
            <ul className="ml-5 list-disc space-y-1">
              <li>Делятся прямой ссылкой Tilda вместо короткой <Code>/r/...</Code> — клики не считаются.</li>
              <li>Пишут source по-разному: <Code>tg</Code>, <Code>telegram</Code>, <Code>Telegram</Code> — данные дробятся.</li>
              <li>Забыли сниппет на Tilda — нет click_id, привязка только оценочная.</li>
              <li>Не указали секрет в webhook — события приходят со статусом unauthorized.</li>
              <li>Пробелы и заглавные в utm_campaign — ссылка ломается, метки читаются криво.</li>
            </ul>
          </Section>

          <Section id="examples" n={19} title="Примеры правильных ссылок">
            <div className="space-y-3">
              <Code>https://your-page.tilda.ws?utm_source=instagram&utm_medium=social&utm_campaign=icy_s26&utm_content=story_may30</Code>
              <Code>https://your-page.tilda.ws?utm_source=telegram&utm_medium=social&utm_campaign=icy_s26&utm_content=announcement</Code>
              <Code>https://your-page.tilda.ws?utm_source=email&utm_medium=email&utm_campaign=icy_s26&utm_content=mailing</Code>
            </div>
            <Tip>Но вам не нужно собирать это вручную — трекер строит такой URL сам, когда вы создаёте ссылку.</Tip>
          </Section>

          <Section id="checklist" n={20} title="Мини-чеклист перед запуском рекламы">
            <ul className="space-y-2">
              {[
                "Создана кампания во вкладке Campaigns",
                "Создана короткая ссылка с заполненными source / medium / campaign / content",
                "Destination ведёт на правильную страницу Tilda",
                "На страницу Tilda добавлен JS-сниппет",
                "В форме Tilda настроен webhook с правильным URL и секретом",
                "Отправлен тестовый лид — он появился в Leads со статусом exact",
                "Поделились именно короткой ссылкой /r/…, а не прямой ссылкой Tilda",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 rounded-xl border border-line bg-bg-base px-4 py-3 text-sm text-ink-muted">
                  <span className="mt-0.5 text-leads">✓</span>{item}
                </li>
              ))}
            </ul>
          </Section>
        </article>
      </div>
    </>
  );
}
