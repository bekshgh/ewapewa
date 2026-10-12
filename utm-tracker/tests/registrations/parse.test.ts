import { describe, expect, it } from "vitest";
import type { Grid, RawCell, Workbook } from "@/lib/reports/xlsx";
import { RegistrationImportError, parseRegistrations, registrationKey, toDate } from "@/lib/registrationImport";

function grid(name: string, rows: (string | number | null)[][]): Grid {
  const cells = new Map<string, RawCell>();
  rows.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v !== null) cells.set(`${r + 1},${c + 1}`, { v, fmt: "General", s: 0 });
    }),
  );
  return { name, maxRow: rows.length, maxCol: Math.max(...rows.map((r) => r.length)), cells, merges: [], formulaCells: 0, formulaNoCache: 0 };
}
const wb = (...grids: Grid[]): Workbook => ({ sheetNames: grids.map((g) => g.name), grids, skipped: [], date1904: false });

// 2026-08-29 21:20 local (UTC+5) as an Excel serial.
const SERIAL = (Date.UTC(2026, 7, 29, 21, 20) / 86_400_000) + 25569;
const PAGE = "https://aiesecinkz.tilda.ws/toptalentssprint?utm_source=telegram&utm_campaign=toptalentssprint_f26&utm_content=rassylka&click_id=clk_abc";

describe("parseRegistrations", () => {
  const header = ["Дата и время", "Имя и фамилия", "Email", "Телефон", "utm_source", "utm_campaign", "utm_content", "Страница"];

  it("finds the registrations sheet by its headers and reads rows", () => {
    const parsed = parseRegistrations(
      wb(
        grid("Статистика", [["📊 Аналитика"], ["Всего", 3]]),
        grid("Заявки", [
          header,
          [SERIAL, "Aru Test", "ARU@Example.com ", "+7 700 000 0000", "telegram", "toptalentssprint_f26", "rassylka", PAGE],
          ["30.08.2026 10:05", "No Click", "nc@example.com", null, null, null, null, "https://aiesecinkz.tilda.ws/toptalentssprint"],
          [null, null, null, null, null, null, null, null], // blank line: ignored
          ["not a date", "Broken", "b@example.com", null, null, null, null, null], // skipped
        ]),
      ),
    );

    expect(parsed.sheet).toBe("Заявки");
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.skipped).toBe(1);

    const [a, b] = parsed.rows;
    expect(a.submittedAt.toISOString()).toBe("2026-08-29T16:20:00.000Z"); // 21:20 Almaty
    expect(a.email).toBe("aru@example.com");
    expect(a.clickId).toBe("clk_abc"); // from the page URL
    expect(a.utmCampaign).toBe("toptalentssprint_f26");
    expect(b.submittedAt.toISOString()).toBe("2026-08-30T05:05:00.000Z");
    expect(b.clickId).toBeUndefined();
    expect(b.utmCampaign).toBeUndefined();
  });

  it("takes UTM from the page URL when the columns are missing", () => {
    const parsed = parseRegistrations(wb(grid("Sheet1", [["Date", "Email", "Page"], [SERIAL, "x@example.com", PAGE]])));
    expect(parsed.rows[0]).toMatchObject({ utmSource: "telegram", utmCampaign: "toptalentssprint_f26", utmContent: "rassylka", clickId: "clk_abc" });
  });

  it("rejects a workbook without a registrations header", () => {
    expect(() => parseRegistrations(wb(grid("Sheet1", [["Foo", "Bar"], [1, 2]])))).toThrow(RegistrationImportError);
  });

  it("gives each registration a stable key in its own namespace", () => {
    const r = { row: 2, submittedAt: new Date("2026-08-29T16:20:00Z"), email: "a@b.c" };
    expect(registrationKey(r)).toBe(registrationKey({ ...r, row: 9 }));
    expect(registrationKey(r)).not.toBe(registrationKey({ ...r, submittedAt: new Date("2026-08-29T16:21:00Z") }));
    expect(registrationKey(r).startsWith("reg:")).toBe(true);
  });
});

describe("toDate", () => {
  it("reads ISO text and respects the offset", () => {
    expect(toDate("2026-09-15 12:16:10.912", false, 300)?.toISOString()).toBe("2026-09-15T07:16:10.912Z");
    expect(toDate("", false, 300)).toBeNull();
  });
});
