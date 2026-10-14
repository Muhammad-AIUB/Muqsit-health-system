"use client";

import { C } from "@/theme";
import { fieldLabel } from "@/theme/styles";
import { tell } from "@/lib/dialogs";
import { useMonthlyCost } from "@/hooks/useMonthlyCost";
import { MONTH_DAYS, unpricedReason } from "@/lib/monthlyCost";
import type { RxItem } from "@/types";

// Written with the locale named: a browser set to German would write 8.350,0.
const taka = (n: number): string => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const asLink = {
  background: "none", border: "none", padding: 0, marginLeft: 4, font: "inherit", fontSize: 11, fontWeight: 600,
  color: C.warn[800], cursor: "pointer", textDecoration: "underline dotted", whiteSpace: "nowrap" as const,
};

/**
 * ⚕️ "Total monthly approximate cost" on the prescription header — priced from
 * the medicine chart (`lib/monthlyCost.ts`, `hooks/useMonthlyCost.ts`). The
 * total is of the medicines the chart prices whole; each one it does not is
 * counted beside it, and pressing the count names them with the reason. A
 * chart that could not be reached shows no total at all.
 */
export default function MonthlyCost({ items, mobile }: { items: RxItem[]; mobile: boolean }) {
  const cost = useMonthlyCost(items);
  const amount = cost.state === "none" || cost.priced > 0 ? taka(cost.total) : cost.state === "asking" ? "" : "—";
  const lit = cost.priced > 0 && cost.total > 0;

  const explain = () => {
    const n = cost.unpriced.length;
    const which = cost.unpriced.map((l) => `• ${l.label} — ${l.unpriced ? unpricedReason(l.unpriced) : ""}`).join("\n");
    const rest = cost.priced > 0 ? `৳${taka(cost.total)} is the cost of the other ${cost.priced}.` : "Nothing on the prescription could be priced.";
    void tell({
      title: n === 1 ? "1 medicine is not in the total" : `${n} medicines are not in the total`,
      body: `${which}\n\n${rest}\n\nA medicine is priced from the medicine chart: its price for one tablet, capsule or suppository, times the doses a day, every day for its days — up to ${MONTH_DAYS}. An instruction written on a line of its own is not read.`,
    });
  };

  return (
    <div style={{ flex: mobile ? "1 1 45%" : "0 0 auto", minWidth: mobile ? undefined : 150 }}>
      <label data-caption style={fieldLabel}>Total monthly approximate cost</label>
      <div data-testid="monthly-cost" style={{ padding: "6px 10px", borderRadius: 6, fontSize: 13.5, fontWeight: 600, background: lit ? C.pri[50] : C.n[100], border: `0.5px solid ${lit ? C.pri[100] : C.n[200]}`, color: lit ? C.pri[600] : C.n[500], display: "flex", alignItems: "center", gap: 4, height: 29, boxSizing: "border-box", whiteSpace: "nowrap" }}>
        <span style={{ fontSize: 11, fontWeight: 400 }}>৳</span>{amount}
        {cost.state === "asking" && <span title="Still being priced">…</span>}
        {cost.state === "failed" && (
          <button type="button" onClick={cost.retry} aria-label="Prices not loaded: try again" title="The medicine chart could not be reached. Press to try again." style={asLink}>
            · Prices not loaded
          </button>
        )}
        {cost.state === "ready" && cost.unpriced.length > 0 && (
          <button type="button" onClick={explain} aria-label={`${cost.unpriced.length} not priced: show which medicines, and why`} title="Not in the total — press to see which, and why" style={asLink}>
            · {cost.unpriced.length} not priced
          </button>
        )}
      </div>
    </div>
  );
}
