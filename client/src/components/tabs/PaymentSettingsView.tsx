"use client";

import { useState } from "react";
import { C, font } from "@/theme";
import { btnDisabled, btnPrimary, btnSecondary, fieldLabel, inputMd } from "@/theme/styles";
import Icon from "@/components/common/Icon";
import { Loading, LoadError } from "@/components/common/ListState";
import { useMuqsit } from "@/context/MuqsitContext";
import { useCreatePaymentRequest, usePaymentRequests, useSmsLedger, useSmsWallet } from "@/hooks/useSms";
import { ApiError, type PaymentRequest, type SmsLedgerRow } from "@/lib/api";
import { stamp } from "@/lib/stamp";

type Option = "sms" | "renew";

const REASON_WORD: Record<string, string> = {
  send: "SMS sent (reserved)",
  refund: "Not sent — returned",
  topup: "Added by admin",
  adjust: "Adjusted by admin",
};
const STATUS_WORD: Record<string, string> = { pending: "Waiting for the admin", credited: "Done", rejected: "Rejected" };

// A whole number typed in full, or null — never the start of what was typed.
const wholeNumber = (text: string): number | null => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null);

// Settings → Payment (physician's sheet, 28/10/2026: "Profile er por Payment
// option add korbi: Renew, Buy SMS"). No payment gateway exists in the app: a
// request goes to the admin, who adds the SMS after the payment has come in.
// No price or package is set here — the doctor types the number and the amount.
export default function PaymentSettingsView({ onBack }: { onBack: () => void }) {
  const { isAssistantMode } = useMuqsit();
  const owner = !isAssistantMode;
  const wallet = useSmsWallet();
  const ledger = useSmsLedger(owner);
  const requests = usePaymentRequests(owner);
  const [option, setOption] = useState<Option | null>(null);

  return (
    <div style={{ fontFamily: font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button type="button" onClick={onBack} style={btnSecondary("sm")}><Icon name="arrowLeft" size={14} /> Back</button>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Payment</div>
      </div>

      <Card>
        <div style={{ fontSize: 12, color: C.n[600] }}>SMS balance</div>
        {wallet.error ? (
          <LoadError compact title="Could not load the SMS balance." onRetry={() => wallet.refetch()} retrying={wallet.isFetching} />
        ) : wallet.data ? (
          <div data-sms-wallet style={{ fontSize: 22, fontWeight: 600, color: C.n[900], fontVariantNumeric: "tabular-nums" }}>{wallet.data.balance} taka</div>
        ) : (
          <Loading compact label="Loading balance…" />
        )}
        <div style={{ fontSize: 12, color: C.n[600], marginTop: 4 }}>1 SMS = 1 taka. A Bangla message counts as more SMS than an English one.</div>
      </Card>

      {!owner ? (
        <Card>
          <div style={{ fontSize: 13, color: C.n[700] }}>Only the doctor can buy SMS, renew, or see the SMS history.</div>
        </Card>
      ) : (
        <>
          <Card>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>Choose an option</div>
            <div role="group" aria-label="Payment options" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {(["renew", "sms"] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={option === o}
                  onClick={() => setOption(o)}
                  style={option === o ? btnPrimary("md") : btnSecondary("md")}
                >
                  {o === "renew" ? "Renew" : "Buy SMS"}
                </button>
              ))}
            </div>
            {option && <RequestForm key={option} kind={option} onDone={() => setOption(null)} />}
            <div style={{ fontSize: 12, color: C.n[600], marginTop: 12 }}>
              There is no online payment in the app. Your request goes to the Muqsit admin; after your payment has been received the admin adds the SMS to your balance (or renews), and the request below shows Done.
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>Your requests</div>
            {requests.error ? (
              <LoadError compact title="Could not load your requests." onRetry={() => requests.refetch()} retrying={requests.isFetching} />
            ) : !requests.data ? (
              <Loading compact />
            ) : requests.data.length === 0 ? (
              <div style={{ fontSize: 12.5, color: C.n[600] }}>No requests yet.</div>
            ) : (
              <RequestList rows={requests.data} />
            )}
          </Card>

          <Card>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>SMS history</div>
            {ledger.error ? (
              <LoadError compact title="Could not load the SMS history." onRetry={() => ledger.refetch()} retrying={ledger.isFetching} />
            ) : !ledger.data ? (
              <Loading compact />
            ) : ledger.data.length === 0 ? (
              <div style={{ fontSize: 12.5, color: C.n[600] }}>Nothing yet.</div>
            ) : (
              <LedgerList rows={ledger.data} />
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>{children}</div>;
}

function RequestForm({ kind, onDone }: { kind: Option; onDone: () => void }) {
  const create = useCreatePaymentRequest();
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [sentOk, setSentOk] = useState(false);

  const submit = async () => {
    setProblem("");
    const q = wholeNumber(quantity);
    if (kind === "sms" && (q === null || q < 1)) return setProblem("Enter how many SMS you want to buy, as a whole number.");
    const a = amount.trim() === "" ? undefined : wholeNumber(amount);
    if (a === null || a === 0) return setProblem("The amount must be a whole number of taka, or left empty.");
    try {
      await create.mutateAsync({ kind, ...(kind === "sms" ? { quantity: q as number } : {}), ...(a ? { amount: a } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
      setSentOk(true);
    } catch (e) {
      setProblem(e instanceof ApiError && e.status === 400 ? e.message : "The request could not be sent. Try again.");
    }
  };

  if (sentOk) {
    return (
      <div role="status" style={{ marginTop: 12, fontSize: 13, color: C.ok[800] }}>
        Request sent to the admin. It shows below as “Waiting for the admin” until it is done.
        <div style={{ marginTop: 8 }}><button type="button" onClick={onDone} style={btnSecondary("sm")}>OK</button></div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }}>
      {kind === "sms" && (
        <div>
          <label data-caption htmlFor="pay-quantity" style={fieldLabel}>Number of SMS</label>
          <input id="pay-quantity" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ ...inputMd, width: "100%" }} />
        </div>
      )}
      <div>
        <label data-caption htmlFor="pay-amount" style={fieldLabel}>Amount you pay (taka, optional)</label>
        <input id="pay-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...inputMd, width: "100%" }} />
      </div>
      <div>
        <label data-caption htmlFor="pay-note" style={fieldLabel}>Note for the admin (optional)</label>
        <input id="pay-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="How and when you paid" style={{ ...inputMd, width: "100%" }} />
      </div>
      {problem && <div role="alert" style={{ fontSize: 12.5, color: C.danger[800] }}>{problem}</div>}
      <div>
        <button
          type="button"
          onClick={submit}
          disabled={create.isPending}
          style={create.isPending ? { ...btnPrimary("md"), ...btnDisabled } : btnPrimary("md")}
        >
          {create.isPending ? "Sending…" : kind === "sms" ? "Send Buy SMS request" : "Send Renew request"}
        </button>
      </div>
    </div>
  );
}

function RequestList({ rows }: { rows: PaymentRequest[] }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {rows.map((r) => (
        <li key={r.id} data-payment-request={r.status} style={{ padding: "7px 0", borderBottom: `0.5px solid ${C.n[100]}`, fontSize: 12.5, display: "flex", gap: 8, flexWrap: "wrap", fontVariantNumeric: "tabular-nums" }}>
          <span style={{ fontWeight: 600 }}>{r.kind === "sms" ? `Buy SMS · ${r.quantity ?? "—"} SMS` : "Renew"}</span>
          {r.amount !== null && <span style={{ color: C.n[700] }}>{r.amount} taka</span>}
          <span style={{ color: C.n[600] }}>{stamp(r.createdAt)}</span>
          <span style={{ marginLeft: "auto", fontWeight: 600, color: r.status === "credited" ? C.ok[800] : r.status === "rejected" ? C.danger[800] : C.warn[800] }}>
            {STATUS_WORD[r.status] ?? r.status}
            {r.status === "credited" && r.credited !== null ? ` · ${r.credited} SMS added` : ""}
          </span>
          {r.adminNote && <div style={{ width: "100%", color: C.n[700] }}>Admin: {r.adminNote}</div>}
        </li>
      ))}
    </ul>
  );
}

function LedgerList({ rows }: { rows: SmsLedgerRow[] }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {rows.map((l) => (
        <li key={l.id} style={{ padding: "6px 0", borderBottom: `0.5px solid ${C.n[100]}`, fontSize: 12.5, display: "flex", gap: 8, flexWrap: "wrap", fontVariantNumeric: "tabular-nums" }}>
          <span style={{ fontWeight: 600, color: l.delta < 0 ? C.n[900] : C.ok[800], minWidth: 64 }}>{l.delta > 0 ? `+${l.delta}` : String(l.delta)} taka</span>
          <span>{REASON_WORD[l.reason] ?? l.reason}</span>
          {l.note && <span style={{ color: C.n[600] }}>{l.note}</span>}
          <span style={{ marginLeft: "auto", color: C.n[600] }}>{stamp(l.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}
