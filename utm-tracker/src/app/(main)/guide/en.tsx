import { Code, Note, Section, type GuideSection } from "./parts";

const Tip = ({ children }: { children: React.ReactNode }) => <Note kind="tip" label="Tip.">{children}</Note>;
const Warn = ({ children }: { children: React.ReactNode }) => <Note kind="warn" label="Important.">{children}</Note>;
const Fix = ({ children }: { children: React.ReactNode }) => <Note kind="fix" label="If it doesn't work.">{children}</Note>;

export const SECTIONS: GuideSection[] = [
  { id: "utm", n: 1, t: "UTM tags in plain words" },
  { id: "why", n: 2, t: "Why a tracker" },
  { id: "click", n: 3, t: "What a click is" },
  { id: "lead", n: 4, t: "What a lead is" },
  { id: "conversion", n: 5, t: "What conversion is" },
  { id: "first-link", n: 6, t: "Creating links" },
  { id: "source", n: 7, t: "Choosing utm_source" },
  { id: "medium", n: 8, t: "Choosing utm_medium" },
  { id: "campaign", n: 9, t: "Naming utm_campaign" },
  { id: "content-term", n: 10, t: "utm_content and utm_term" },
  { id: "where", n: 11, t: "Where to put the link" },
  { id: "tilda", n: 12, t: "Connecting Tilda" },
  { id: "webhook", n: 13, t: "Optional: Tilda webhook" },
  { id: "fields", n: 14, t: "Form fields" },
  { id: "clickid", n: 15, t: "Why click_id matters" },
  { id: "check", n: 16, t: "Checking that it works" },
  { id: "read", n: 17, t: "Reading the analytics" },
  { id: "mistakes", n: 18, t: "Common mistakes" },
  { id: "examples", n: 19, t: "Examples of good links" },
  { id: "checklist", n: 20, t: "Checklist before launching ads" },
];

/** The guide in English. */
export function Body() {
  return (
    <>
      <Section id="utm" n={1} title="UTM tags in plain words">
        <p>UTM tags are labels attached to a link so you can later tell where a person came from. The link works as usual; the labels just end up in the statistics.</p>
        <p>Example: you post a link on Instagram and on Telegram. They look almost the same, but with tags you see that 80 people came from Instagram and 200 from Telegram.</p>
        <p>There are five tags: <Code>utm_source</Code> (where from), <Code>utm_medium</Code> (how), <Code>utm_campaign</Code> (which campaign), <Code>utm_content</Code> (which exact post or placement) and <Code>utm_term</Code> (keyword or audience, mostly for ads).</p>
      </Section>

      <Section id="why" n={2} title="Why a tracker">
        <p>Without a tracker you see the total number of sign-ups but not which channel brought them. The tracker ties each click to each lead and shows which link really brings people and which just costs time.</p>
        <Tip>It keeps you from wasting budget: invest in what works and switch off what doesn&apos;t.</Tip>
      </Section>

      <Section id="click" n={3} title="What a click is">
        <p>A click is someone opening your link. EwA Tracker counts clicks on the server at the moment of the redirect, so ad blockers and disabled JavaScript don&apos;t affect the count.</p>
        <p>We tell <strong>unique</strong> clicks (different people) apart from <strong>repeat</strong> clicks (one person opening the link several times).</p>
      </Section>

      <Section id="lead" n={4} title="What a lead is">
        <p>A lead is a person who signed up: filled in the form on the landing page and left a name, phone or email. A click is interest; a lead is action.</p>
      </Section>

      <Section id="conversion" n={5} title="What conversion is">
        <p>Conversion rate (CR) is the share of people who clicked and then signed up: <Code>leads ÷ unique clicks × 100%</Code>.</p>
        <p>Example: 100 unique clicks and 13 sign-ups = 13% conversion. The higher it is, the better the &quot;channel → page&quot; pair works.</p>
      </Section>

      <Section id="first-link" n={6} title="Creating links">
        <p><strong>All links of a project at once:</strong> open the campaign and press <strong>Create UTM links</strong>. Set the project code (e.g. <Code>tts</Code>) and the landing page, pick the &quot;Project set&quot; template or &quot;Same as another campaign&quot;, adjust the rows and press <strong>Create</strong>. You get links like <Code>/r/tts-ig-tapter</Code>, ready to copy or download as CSV.</p>
        <p><strong>A single link:</strong> open <strong>Create link</strong> and fill in:</p>
        <ol className="ml-5 list-decimal space-y-1">
          <li>Description — for you and the team (e.g. &quot;Instagram story, May 30&quot;).</li>
          <li>Destination URL — where it leads, usually the Tilda page.</li>
          <li>Source, Medium, Campaign — pick from the lists.</li>
          <li>Content — the exact placement (story_may30, bio_link).</li>
          <li>Press <strong>Create link</strong> — you get a short link like <Code>/r/abc123</Code>.</li>
        </ol>
        <Tip>The right panel shows the short link and the full URL with tags as you type.</Tip>
      </Section>

      <Section id="source" n={7} title="Choosing utm_source">
        <p>Source is the platform the traffic comes <em>from</em>. Write the platform name, not the type: <Code>instagram</Code>, <Code>telegram</Code>, <Code>email</Code>, <Code>youtube</Code>.</p>
        <Warn>Always spell it the same way. <Code>instagram</Code> and <Code>Instagram</Code> are counted as two different sources.</Warn>
      </Section>

      <Section id="medium" n={8} title="Choosing utm_medium">
        <p>Medium is <em>how</em> the person reached the link:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li><Code>social</Code> — a regular post or story;</li>
          <li><Code>bio</Code> — link in bio;</li>
          <li><Code>message</Code> — direct message or chat mailing;</li>
          <li><Code>cpc</Code> — paid ads;</li>
          <li><Code>email</Code> — newsletter;</li>
          <li><Code>referral</Code> — a partner&apos;s link;</li>
          <li><Code>offline</Code> — QR code, poster, banner.</li>
        </ul>
      </Section>

      <Section id="campaign" n={9} title="Naming utm_campaign">
        <p>Campaign is the name of the whole activity. Lower case, no spaces, meaningful: <Code>icy_s26</Code>, <Code>toptalentssprint_f26</Code>.</p>
        <Tip>Adding the season or year makes the campaign easy to find later.</Tip>
      </Section>

      <Section id="content-term" n={10} title="utm_content and utm_term">
        <p><Code>utm_content</Code> separates <em>different placements within one campaign</em>: <Code>tapter</Code>, <Code>rassylka</Code>, <Code>infopartner1</Code>. That&apos;s how you see which exact post or partner worked.</p>
        <p><Code>utm_term</Code> is mainly for paid ads — a keyword or audience: <Code>youth_almaty</Code>. Optional.</p>
      </Section>

      <Section id="where" n={11} title="Where to put the link">
        <p>The short link <Code>/r/...</Code> can go anywhere:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li><strong>Instagram</strong> — link in bio or stories;</li>
          <li><strong>Telegram</strong> — a post, a pinned message or a mailing;</li>
          <li><strong>Email</strong> — the newsletter button;</li>
          <li><strong>Ads</strong> — as the target URL;</li>
          <li><strong>Offline</strong> — inside a QR code on a poster or banner.</li>
        </ul>
        <Warn>Always share the tracker&apos;s short link, not the direct Tilda link. Otherwise the click isn&apos;t counted.</Warn>
      </Section>

      <Section id="tilda" n={12} title="Connecting Tilda">
        <p>The flow: short link → the click is counted here → the person lands on Tilda → fills in the form → the lead is counted here.</p>
        <ol className="ml-5 list-decimal space-y-1">
          <li>Use your Tilda page address as the link&apos;s destination (or the landing page in Create UTM links).</li>
          <li>In Tilda: <strong>Site settings → Insert code → HEAD</strong>, paste the one line from the <strong>Webhook</strong> tab (<Code>&lt;script src=&quot;…/t.js&quot; async&gt;&lt;/script&gt;</Code>), save and republish all pages.</li>
          <li>That&apos;s it: once per Tilda site, not per page or per link. Each project landing on its own Tilda site needs the line too.</li>
        </ol>
        <p>
          The same line also turns on <strong>Forms</strong>: every form on every page of the site shows up there by itself after its first visitor — where people
          drop off, which questions they get stuck on, what blocks «Send». Nothing typed is stored, only whether a field was filled. The form joins the project
          whose links lead to that page (else the visitor&apos;s utm_campaign); you can change it on the form&apos;s page. To check a page yourself without
          spoiling the numbers, open it with <Code>?tt_debug=1</Code>: the visit is marked as a test.
        </p>
      </Section>

      <Section id="webhook" n={13} title="Optional: Tilda webhook">
        <p>The script above already counts leads. A webhook is an extra, server-side channel: Tilda sends us the form data right after it is submitted. Both together never count a lead twice.</p>
        <ol className="ml-5 list-decimal space-y-1">
          <li>In Tilda open the form → <strong>Settings → Data capture</strong>.</li>
          <li>Add the <strong>Webhook</strong> service.</li>
          <li>Paste the URL from the tracker&apos;s <strong>Webhook</strong> tab.</li>
          <li>Add the header <Code>X-Webhook-Secret</Code> with the secret. If you can&apos;t add a header, append <Code>?secret=YOUR_SECRET</Code> to the URL — it works, but addresses end up in server logs, so the header is safer.</li>
          <li>Without the secret the request (and &quot;Send test&quot;) gets a 401 error.</li>
          <li>Save and press &quot;Send test&quot;.</li>
        </ol>
      </Section>

      <Section id="fields" n={14} title="Form fields">
        <p>Visible fields (name, phone, email) stay as they are. The script adds hidden fields automatically: <Code>click_id</Code>, <Code>utm_source</Code>, <Code>utm_medium</Code>, <Code>utm_campaign</Code>, <Code>utm_content</Code>, <Code>utm_term</Code>.</p>
        <Tip>You don&apos;t create anything by hand — the script takes the values from the address bar.</Tip>
      </Section>

      <Section id="clickid" n={15} title="Why click_id matters">
        <p><Code>click_id</Code> is the unique code of one click. We add it to the Tilda address automatically. When the form reports it back, we know exactly which click brought the person.</p>
        <Warn>With <Code>click_id</Code> attribution is <strong>exact</strong>. Without it we guess by UTM and time — <strong>estimated</strong>, which is less reliable.</Warn>
      </Section>

      <Section id="check" n={16} title="Checking that it works">
        <ol className="ml-5 list-decimal space-y-1">
          <li>Open your short link — a click appears on the Dashboard.</li>
          <li>Check that the Tilda address now has <Code>?...&click_id=clk_...</Code>.</li>
          <li>Fill in the Tilda form with test data and submit.</li>
          <li>A lead with status <strong>exact</strong> appears in <strong>Leads</strong>.</li>
        </ol>
        <Fix>No click — a direct Tilda link was shared instead of the short one. No lead — the <Code>/t.js</Code> line is missing on that Tilda site, or the page wasn&apos;t republished after adding it. Estimated instead of exact — the visitor didn&apos;t come through a short link.</Fix>
      </Section>

      <Section id="read" n={17} title="Reading the analytics">
        <p><strong>Total clicks</strong> — all visits. <strong>Unique clicks</strong> — different people. <strong>Leads</strong> — sign-ups. <strong>Conversion rate</strong> — leads ÷ unique clicks: the share of different people who opened the link and then signed up.</p>
        <p>The &quot;By source / campaign / content&quot; tables show which channel and placement bring the most leads. Look at <strong>conversion</strong>, not clicks: a channel with fewer clicks sometimes brings more sign-ups.</p>
      </Section>

      <Section id="mistakes" n={18} title="Common mistakes">
        <ul className="ml-5 list-disc space-y-1">
          <li>Sharing the direct Tilda link instead of the short <Code>/r/...</Code> one — clicks aren&apos;t counted.</li>
          <li>Spelling the source differently: <Code>tg</Code>, <Code>telegram</Code>, <Code>Telegram</Code> — the data splits.</li>
          <li>No <Code>/t.js</Code> line on the landing&apos;s Tilda site — leads aren&apos;t counted.</li>
          <li>A webhook without the secret — events arrive as unauthorized.</li>
          <li>Spaces and capitals in utm_campaign — tags are read inconsistently.</li>
        </ul>
      </Section>

      <Section id="examples" n={19} title="Examples of good links">
        <div className="space-y-3">
          <Code>https://your-page.tilda.ws?utm_source=instagram&utm_medium=bio&utm_campaign=toptalentssprint_f26&utm_content=tapter</Code>
          <Code>https://your-page.tilda.ws?utm_source=telegram&utm_medium=message&utm_campaign=toptalentssprint_f26&utm_content=rassylka</Code>
          <Code>https://your-page.tilda.ws?utm_source=email&utm_medium=email&utm_campaign=toptalentssprint_f26&utm_content=mailing</Code>
        </div>
        <Tip>You never build these by hand — the tracker adds the tags when a short link is opened.</Tip>
      </Section>

      <Section id="checklist" n={20} title="Checklist before launching ads">
        <ul className="space-y-2">
          {[
            "The campaign exists in Campaigns",
            "Links are created (Create UTM links on the campaign page)",
            "The destination is the right Tilda page",
            "The /t.js line is in Insert code → HEAD of that Tilda site, and pages are republished",
            "A test sign-up through a short link appeared in Leads as exact",
            "Only short /r/… links are shared, never the direct Tilda link",
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
