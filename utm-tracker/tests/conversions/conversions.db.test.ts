import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import {
  ActionError,
  createSnapshot,
  decide,
  listSnapshots,
  refreshFromSheet,
  reviewQueue,
  saveConfig,
  saveManual,
  setOverride,
  uploadRegistration,
} from "@/lib/conversions/actions";
import { QUALITY_KEY } from "@/lib/conversions/settings";
import { loadState, saveRegistration, type ManualState } from "@/lib/conversions/state";
import { REGISTRATION_FILE, parseFile } from "../reports/helpers";

// Needs a migrated Postgres: TEST_DATABASE_URL=postgresql://… npx vitest run
// One file on purpose: both suites switch off MX lookups in the shared AppSetting.
const url = process.env.TEST_DATABASE_URL;

vi.mock("@/lib/conversions/sheets", async (orig) => ({
  ...(await orig<object>()),
  readTab: vi.fn(async () => [
    ["Отметка времени", "Email", "Имя", "Телефон"],
    ["01.10.2026 10:00:00", "aigerim@mail.ru", "Айгерим", "+7 701 348 92 15"],
    ["01.10.2026 10:05:00", "AIGERIM@mail.ru", "Айгерим", ""],
    ["01.10.2026 10:09:00", "test@mailinator.com", "test", "+7 777 777 77 77"],
    ["01.10.2026 10:20:00", "qwerty@mail.ru", "Асель", ""],
    ["01.10.2026 10:30:00", "dana@inbox.kz", "Дана", ""],
  ]),
}));

describe.skipIf(!url)("conversions (database)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  let savedQuality: Prisma.JsonValue | undefined;

  beforeAll(async () => {
    savedQuality = (await db.appSetting.findUnique({ where: { key: QUALITY_KEY } }))?.value;
    await db.appSetting.upsert({ where: { key: QUALITY_KEY }, create: { key: QUALITY_KEY, value: { checkMx: false } }, update: { value: { checkMx: false } } });
  });

  afterAll(async () => {
    if (savedQuality === undefined) await db.appSetting.delete({ where: { key: QUALITY_KEY } }).catch(() => null);
    else await db.appSetting.update({ where: { key: QUALITY_KEY }, data: { value: savedQuality as Prisma.InputJsonValue } });
    await db.$disconnect();
  });

  describe("sources", () => {
    const tag = `conv-${Date.now()}`;
    let projectId = "";
    let ogxCampaignId = "";

    beforeAll(async () => {
      const type = await db.projectType.findUniqueOrThrow({ where: { key: "forum" } });
      projectId = (await db.project.create({ data: { slug: tag, name: "Conversion test", typeId: type.id } })).id;
      const ogx = await db.campaign.create({ data: { name: `${tag}_ogx` } });
      const other = await db.campaign.create({ data: { name: `${tag}_other` } });
      ogxCampaignId = ogx.id;
      const link = await db.trackingLink.create({ data: { name: "ogx", slug: `${tag}-ogx`, destinationUrl: "https://x.kz", campaignId: ogx.id, utmCampaign: ogx.name } });
      const otherLink = await db.trackingLink.create({ data: { name: "other", slug: `${tag}-other`, destinationUrl: "https://x.kz", campaignId: other.id } });
      const lead = (i: number, data: Partial<Prisma.LeadUncheckedCreateInput>) =>
        db.lead.create({ data: { submittedAt: new Date(Date.UTC(2026, 9, 1, 10, i * 7)), sourcePayload: {}, dedupeKey: `${tag}-${i}`, ...data } });
      await Promise.all([
        lead(1, { trackingLinkId: link.id, email: "Ainur@gmail.com", utmCampaign: ogx.name }), // by link
        lead(2, { email: "a.inur+2@gmail.com", utmCampaign: ogx.name }), // duplicate of 1, by utm only
        lead(3, { email: "bota@mail.ru", utmCampaign: ogx.name }), // by utm only
        lead(4, { trackingLinkId: link.id, email: "test@mailinator.com" }), // quarantined
        lead(5, { trackingLinkId: link.id, email: null }), // no email
        lead(6, { trackingLinkId: otherLink.id, email: "x@mail.ru", utmCampaign: other.name }), // other campaign
        lead(7, { email: "nobody@mail.ru" }), // no UTM, no link
      ]);
    });

    afterAll(async () => {
      await db.lead.deleteMany({ where: { dedupeKey: { startsWith: tag } } });
      await db.trackingLink.deleteMany({ where: { slug: { startsWith: tag } } });
      await db.rowReview.deleteMany({ where: { projectId } });
      await db.report.deleteMany({ where: { projectId } });
      await db.project.delete({ where: { id: projectId } }).catch(() => null);
      await db.campaign.deleteMany({ where: { name: { startsWith: tag } } });
    });

    it("without sources: nothing is invented", async () => {
      const s = await loadState(db, projectId);
      expect(s.inputs.projectRegs.value).toBeNull();
      expect(s.inputs.regOgx.value).toBeNull();
      expect(s.ratios.every((r) => r.value === null && r.status === "missing_input")).toBe(true);
    });

    it("regOgx counts only this campaign's leads, deduplicated, quarantine excluded", async () => {
      await db.projectConversionConfig.create({ data: { projectId, ogxCampaignId } });
      const s = await loadState(db, projectId);
      // leads 1,2,3,4,5 belong to the campaign; 6 (other campaign) and 7 (no UTM) never do
      expect(s.inputs.regOgx.breakdown).toMatchObject({ raw: 5, invalid: 1, duplicates: 1, unique: 3, quarantined: 1, total: 2, strict: 2 });
      expect(s.inputs.regOgx.value).toBe(2);
    });

    it("a rejection decision lowers the number and is reversible", async () => {
      const before = await loadState(db, projectId);
      const { createHash } = await import("node:crypto");
      const key = createHash("sha256").update("bota@mail.ru").digest("hex");
      await db.rowReview.create({ data: { projectId, source: "ogx", rowKey: key, status: "valid", decision: "rejected", decidedBy: "a", decidedAt: new Date() } });
      expect((await loadState(db, projectId)).inputs.regOgx.value).toBe(before.inputs.regOgx.value! - 1);
      await db.rowReview.update({ where: { projectId_source_rowKey: { projectId, source: "ogx", rowKey: key } }, data: { decision: null } });
      expect((await loadState(db, projectId)).inputs.regOgx.value).toBe(before.inputs.regOgx.value);
    });

    it("projectRegs falls back to the published Registration report, labelled as such", async () => {
      const doc = await parseFile(REGISTRATION_FILE);
      await db.report.create({
        data: { slug: `${tag}-reg`, type: "registration", title: "Test reg", status: "published", parserVersion: doc.parserVersion, data: doc as unknown as Prisma.InputJsonValue, projectId },
      });
      const s = await loadState(db, projectId);
      expect(s.inputs.projectRegs.value).toBeGreaterThan(0);
      expect(s.inputs.projectRegs.origin).toContain("отчёта Registration");
      expect(s.inputs.projectRegs.note).toContain("Запасной источник");
    });

    it("a processed table wins over the fallback; a later failed refresh keeps the data", async () => {
      const rows = [
        { email: "one@mail.ru", ref: "row 2" },
        { email: "ONE@mail.ru ", ref: "row 3" },
        { email: "two@mail.ru", ref: "row 4" },
        { email: "", ref: "row 5" },
      ];
      await saveRegistration(db, projectId, rows, { origin: "upload", label: "regs.csv" });
      let s = await loadState(db, projectId);
      expect(s.inputs.projectRegs).toMatchObject({ value: 2, origin: "из файла: regs.csv" });
      expect(s.inputs.projectRegs.breakdown).toMatchObject({ raw: 4, invalid: 1, duplicates: 1, total: 2 });
      // stored rows carry no personal data
      const stored = await db.rowReview.findMany({ where: { projectId, source: "sheet" } });
      expect(JSON.stringify(stored)).not.toContain("one@mail.ru");

      const cfg = await db.projectConversionConfig.findUniqueOrThrow({ where: { projectId } });
      await db.projectConversionConfig.update({
        where: { projectId },
        data: { registrationMeta: { ...(cfg.registrationMeta as object), error: "Нет доступа к таблице", errorAt: new Date().toISOString() } },
      });
      s = await loadState(db, projectId);
      expect(s.inputs.projectRegs.value).toBe(2);
      expect(s.inputs.projectRegs.note).toContain("Нет доступа");
    });

    it("manual values and overrides feed the ratios", async () => {
      const manual: ManualState = {
        showUp: { value: 1, by: "a", at: new Date().toISOString() },
        overrides: { projectRegs: { value: 4, reason: "таблица неполная", by: "a", at: new Date().toISOString() } },
      };
      await db.projectConversionConfig.update({ where: { projectId }, data: { manual: manual as unknown as Prisma.InputJsonValue } });
      const s = await loadState(db, projectId);
      expect(s.inputs.projectRegs).toMatchObject({ value: 4, mode: "manual", autoValue: 2 });
      expect(s.ratios.find((r) => r.key === "ogx_per_regs")).toMatchObject({ num: 2, den: 4, value: 0.5 });
      expect(s.ratios.find((r) => r.key === "ogx_per_showup")).toMatchObject({ value: 2, over100: true, smallBase: true });
    });
});

  describe("actions", () => {
    const tag = `act-${Date.now()}`;
    let projectId = "";
    const logs: string[] = [];

    beforeAll(async () => {
      for (const m of ["log", "info", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation((...a) => void logs.push(a.map(String).join(" ")));
      const type = await db.projectType.findUniqueOrThrow({ where: { key: "forum" } });
      projectId = (await db.project.create({ data: { slug: tag, name: "Actions test", typeId: type.id } })).id;
    });

    afterAll(async () => {
      vi.restoreAllMocks();
      await db.conversionAudit.deleteMany({ where: { projectId } });
      await db.rowReview.deleteMany({ where: { projectId } });
      await db.project.delete({ where: { id: projectId } }).catch(() => null);
    });

    it("manual values: negative / fractional rejected, logic warnings do not block", async () => {
      await expect(saveManual(db, projectId, { showUp: -5 }, "admin@x")).rejects.toBeInstanceOf(ActionError);
      await expect(saveManual(db, projectId, { aiesecOrgSignup: 1.5 }, "admin@x")).rejects.toThrow(/целое/);
      await saveManual(db, projectId, { showUp: 300, aiesecOrgSignup: 30, asOf: "2026-10-01", note: "с площадки" }, "admin@x");
      const s = await loadState(db, projectId);
      expect(s.inputs.showUp).toMatchObject({ value: 300, mode: "manual" });
      expect(s.inputs.showUp.manual).toMatchObject({ by: "admin@x", asOf: "2026-10-01" });
    });

    it("refreshes from the sheet: duplicates out, fake in quarantine, cooldown respected", async () => {
      await saveConfig(db, projectId, { registrationSheet: { spreadsheetId: "x".repeat(30), tab: "Ответы", emailCol: "Email", timeCol: "Отметка времени", nameCol: "Имя", phoneCol: "Телефон" } }, "admin@x");
      const first = await refreshFromSheet(db, projectId, "admin@x");
      expect(first.cached).toBe(false);
      const s = await loadState(db, projectId);
      // 5 rows → 1 duplicate → 4 unique: test@mailinator quarantined, qwerty suspicious (counted, pending)
      expect(s.inputs.projectRegs.breakdown).toMatchObject({ raw: 5, duplicates: 1, unique: 4, quarantined: 1, pending: 1, total: 3, strict: 2 });
      expect((await refreshFromSheet(db, projectId, "admin@x")).cached).toBe(true);
    });

    it("the queue shows reasons with masked emails; decisions by flag are reversible", async () => {
      const queue = await reviewQueue(db, projectId);
      expect(queue.map((q) => q.label).sort()).toEqual(["q***@mail.ru", "t***@mailinator.com"]);
      expect(queue.find((q) => q.label.startsWith("t"))).toMatchObject({ status: "quarantined", ref: "row 4" });
      expect(queue.find((q) => q.label.startsWith("t"))!.flags).toEqual(expect.arrayContaining(["disposable_email", "test_words", "placeholder_phone"]));

      await decide(db, projectId, { source: "sheet", flag: "disposable_email", decision: "approved" }, "admin@x");
      expect((await loadState(db, projectId)).inputs.projectRegs.value).toBe(4);
      const qKey = queue.find((q) => q.label.startsWith("q"))!.key;
      await decide(db, projectId, { source: "sheet", keys: [qKey], decision: "rejected" }, "admin@x");
      expect((await loadState(db, projectId)).inputs.projectRegs.breakdown).toMatchObject({ total: 3, strict: 3, rejected: 1, approved: 1 });
      await decide(db, projectId, { source: "sheet", keys: [qKey], decision: null }, "admin@x");
      await decide(db, projectId, { source: "sheet", flag: "disposable_email", decision: null }, "admin@x");
      expect((await loadState(db, projectId)).inputs.projectRegs.value).toBe(3);
      const decided = await db.rowReview.findFirst({ where: { projectId, rowKey: qKey } });
      expect(decided).toMatchObject({ decision: null, decidedBy: null });
    });

    it("overriding an automatic value needs a reason", async () => {
      await expect(setOverride(db, projectId, "projectRegs", { value: 600, reason: "  " }, "admin@x")).rejects.toThrow(/причину/);
      await setOverride(db, projectId, "projectRegs", { value: 600, reason: "часть регистраций была на бумаге" }, "admin@x");
      expect((await loadState(db, projectId)).inputs.projectRegs).toMatchObject({ value: 600, mode: "manual", autoValue: 3 });
    });

    it("snapshots are append-only; the current state stays live", async () => {
      const first = await createSnapshot(db, projectId, { asOfDate: "2026-10-01", note: "первый" }, "admin@x");
      await saveManual(db, projectId, { aiesecOrgSignup: 45 }, "admin@x");
      await createSnapshot(db, projectId, { asOfDate: "2026-10-08" }, "admin@x");
      const again = await db.conversionSnapshot.findUniqueOrThrow({ where: { id: first.id } });
      expect(again).toMatchObject({ aiesecOrgSignup: 30, projectRegs: 600, note: "первый" });
      expect("updatedAt" in again).toBe(false); // the model has no update timestamp: never edited
      const history = await listSnapshots(db, projectId);
      expect(history.map((h) => [h.asOfDate, h.inputs.aiesecOrgSignup])).toEqual([["2026-10-08", 45], ["2026-10-01", 30]]);
      expect(history[1].ratios.find((r) => r.key === "signup_per_regs")?.value).toBeCloseTo(30 / 600);
      expect((history[1].sources as Record<string, { overrideReason: string }>).projectRegs.overrideReason).toContain("бумаге");
      expect((await loadState(db, projectId)).inputs.aiesecOrgSignup.value).toBe(45);
    });

    it("an uploaded CSV can replace the sheet as the source", async () => {
      const csv = Buffer.from("Email;Name\nnew1@mail.ru;A\nnew2@mail.ru;B\n");
      const preview = await uploadRegistration(db, projectId, { name: "regs.csv", bytes: csv }, null, null, "admin@x");
      expect(preview).toMatchObject({ preview: { rows: 2, guess: { emailCol: "Email" } } });
      await uploadRegistration(db, projectId, { name: "regs.csv", bytes: csv }, { emailCol: "Email" }, null, "admin@x");
      await setOverride(db, projectId, "projectRegs", null, "admin@x");
      expect((await loadState(db, projectId)).inputs.projectRegs).toMatchObject({ value: 2, origin: "из файла: regs.csv" });
    });

    it("every write is audited, with no personal data in audit or logs", async () => {
      const audit = await db.conversionAudit.findMany({ where: { projectId } });
      expect(new Set(audit.map((a) => a.action))).toEqual(new Set(["manual", "config", "refresh_sheet", "decision", "override", "override_cleared", "snapshot", "upload"]));
      expect(audit.every((a) => a.actor === "admin@x")).toBe(true);
      const everything = JSON.stringify(audit) + logs.join("\n") + JSON.stringify(await db.rowReview.findMany({ where: { projectId } }));
      for (const pii of ["aigerim@mail.ru", "qwerty@mail.ru", "Айгерим", "348 92 15", "new1@mail.ru"]) expect(everything).not.toContain(pii);
    });
});
});
