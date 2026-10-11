import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import { loadState, saveRegistration, type ManualState } from "@/lib/conversions/state";
import { QUALITY_KEY } from "@/lib/conversions/settings";
import { REGISTRATION_FILE, parseFile } from "../reports/helpers";

// Needs a migrated Postgres: TEST_DATABASE_URL=postgresql://… npx vitest run
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("conversion sources (database)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const tag = `conv-${Date.now()}`;
  let projectId = "";
  let ogxCampaignId = "";
  let savedQuality: Prisma.JsonValue | undefined;

  beforeAll(async () => {
    savedQuality = (await db.appSetting.findUnique({ where: { key: QUALITY_KEY } }))?.value;
    await db.appSetting.upsert({ where: { key: QUALITY_KEY }, create: { key: QUALITY_KEY, value: { checkMx: false } }, update: { value: { checkMx: false } } });
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
    if (savedQuality === undefined) await db.appSetting.delete({ where: { key: QUALITY_KEY } }).catch(() => null);
    else await db.appSetting.update({ where: { key: QUALITY_KEY }, data: { value: savedQuality as Prisma.InputJsonValue } });
    await db.$disconnect();
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
