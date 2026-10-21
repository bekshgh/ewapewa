/**
 * Russian for every interface string: the key is the English text used in the
 * code (t("…")). tests/i18n.test.ts checks that each t("…") in src has an entry.
 * Product terms stay as they are: UTM, utm_source, click_id, QR, CSV, CR, NPS,
 * EwA2oGX… F'26 / S'26 are terms (fall / spring) too. One file per area in ru/.
 */
import { COMMON } from "./ru/common";
import { DASHBOARD } from "./ru/dashboard";
import { LINKS } from "./ru/links";
import { CAMPAIGNS } from "./ru/campaigns";
import { FORMS } from "./ru/forms";
import { PROJECTS } from "./ru/projects";
import { PEOPLE } from "./ru/people";
import { SETTINGS } from "./ru/settings";
import { DATA } from "./ru/data";
import { MISC } from "./ru/misc";
import { REPORTS } from "./ru/reports";

export const RU: Record<string, string> = {
  ...COMMON,
  ...DASHBOARD,
  ...LINKS,
  ...CAMPAIGNS,
  ...FORMS,
  ...PROJECTS,
  ...PEOPLE,
  ...SETTINGS,
  ...DATA,
  ...MISC,
  ...REPORTS,
};
