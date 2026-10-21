"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";

export function WebhookTester() {
  const t = useT();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");

  async function fire() {
    setLoading(true); setResult("");
    const res = await fetch("/api/webhooks/test", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    });
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    setResult(JSON.stringify(j.response ?? j, null, 2));
    router.refresh();
  }

  return (
    <div>
      <button className="btn-primary" disabled={loading} onClick={fire}>{loading ? t("Sending…") : t("Send a test lead")}</button>
      {result && (
        <pre className="mt-4 overflow-x-auto rounded-xl border border-line bg-bg-base p-4 text-xs text-leads">{result}</pre>
      )}
    </div>
  );
}
