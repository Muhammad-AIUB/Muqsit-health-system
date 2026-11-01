// @vitest-environment jsdom
//
// "Send SMS to all patients" (physician's sheet, 28/10/2026): asks Bangla or
// English, shows what the server would send and what it costs, and sends only
// on Send. The server is mocked — no SMS leaves a test.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { itKeepsTheKeyboard } from "@/test/dialogKeyboard";
import type { SmsPlan } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  send: vi.fn(),
  confirmAction: vi.fn(),
  tell: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  smsApi: { preview: mocks.preview, send: mocks.send },
}));
vi.mock("@/lib/dialogs", () => ({ confirmAction: mocks.confirmAction, tell: mocks.tell }));

import { ApiError } from "@/lib/api";
import OpdSmsDialog from "./OpdSmsDialog";

vi.setConfig({ testTimeout: 30_000 });

const DAY = "2026-11-02";
const row = (serial: number, over: Record<string, unknown> = {}) => ({
  visitId: `v${serial}`, serial, name: `Patient ${serial}`, mobile: `0171100000${serial}`, minutes: 18 * 60 + (serial - 1) * 10,
  message: `Patient ${serial}, your appointment time to dr. Test at Clinic at 6.${(serial - 1) * 10}PM.`, encoding: "GSM-7", segments: 1, skip: null, ...over,
});
const plan = (over: Partial<SmsPlan> = {}): SmsPlan => ({
  day: DAY, language: "en", doctorName: "Test", chamber: { id: null, name: "Main chamber", address: "Clinic", text: "Clinic" }, problems: [],
  rows: [row(1), row(2, { mobile: null, message: null, segments: 0, skip: "No mobile number." }), row(3)] as SmsPlan["rows"],
  recipients: 2, segments: 2, cost: 2, costPerSegment: 1, balance: 10, gatewayConfigured: true, canSend: true, signature: "sig", ...over,
});
const answer = {
  jobId: "j1", day: DAY, language: "en", sent: 1, failed: 1, skipped: 1, charged: 1, balance: 9,
  results: [
    { visitId: "v1", serial: 1, name: "Patient 1", mobile: "01711000001", message: "m", segments: 1, status: "sent", detail: "Sent" },
    { visitId: "v2", serial: 2, name: "Patient 2", mobile: null, message: null, segments: 0, status: "skipped", detail: "No mobile number." },
    { visitId: "v3", serial: 3, name: "Patient 3", mobile: "01711000003", message: "m", segments: 1, status: "failed", detail: "Gateway rejected the message: error" },
  ],
};

const withQuery = (el: ReactElement) => <QueryClientProvider client={new QueryClient()}>{el}</QueryClientProvider>;
const open = (onBuy = vi.fn(), onClose = vi.fn()) => {
  render(withQuery(<OpdSmsDialog day={DAY} onClose={onClose} onBuy={onBuy} />));
  return { onBuy, onClose };
};
const choose = async (label: RegExp | string) => {
  fireEvent.click(screen.getByRole("button", { name: label }));
  await screen.findByRole("list", { name: "Patients" });
};

beforeEach(() => {
  mocks.preview.mockReset().mockResolvedValue(plan());
  mocks.send.mockReset().mockResolvedValue(answer);
  mocks.confirmAction.mockReset().mockResolvedValue(true);
  mocks.tell.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("Send SMS to all patients", () => {
  it("asks Bangla or English first, and asks the server nothing until one is chosen", async () => {
    open();
    expect(screen.getByText("Send the SMS in Bangla or in English?")).toBeTruthy();
    expect(mocks.preview).not.toHaveBeenCalled();
    await choose(/Bangla/);
    expect(mocks.preview).toHaveBeenCalledWith({ date: DAY, language: "bn" });
  });

  it("shows each patient, why one is not sent, the total and the balance — and sends only on Send", async () => {
    open();
    await choose("English");
    expect(screen.getAllByText(/your appointment time/)).toHaveLength(2);
    expect(screen.getByText("No mobile number.")).toBeTruthy();
    expect(document.querySelector("[data-sms-total]")?.textContent).toBe("2 patients · 2 SMS × 1 taka = 2 taka");
    expect(document.querySelector("[data-sms-balance]")?.textContent).toBe("SMS balance: 10 taka");
    expect(mocks.send).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Send 2 SMS (2 taka)" }));
    await screen.findByRole("list", { name: "Results" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith({ date: DAY, language: "en", previewSignature: "sig" });
    expect(document.querySelector("[data-sms-summary]")?.textContent).toBe("1 sent · 1 failed · 1 not sent");
    expect(screen.getByText("Gateway rejected the message: error")).toBeTruthy();
    expect(screen.getByText(/Charged 1 taka \(only for SMS that were sent\)/)).toBeTruthy();
    expect(document.querySelector('[data-sms-result="failed"]')?.textContent).toContain("Failed");
  });

  it("⚕️ balance short: says so, offers Buy SMS, and cannot send", async () => {
    mocks.preview.mockResolvedValue(plan({ balance: 1, canSend: false }));
    const { onBuy } = open();
    await choose("English");
    expect(screen.getByText("Not enough SMS balance.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Send \d/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Buy SMS" }));
    expect(onBuy).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("an unconfigured gateway is said, and Send is off", async () => {
    mocks.preview.mockResolvedValue(plan({ gatewayConfigured: false, canSend: false }));
    open();
    await choose("English");
    expect(screen.getByText(/SMS gateway is not configured/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /^Send 2 SMS/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("what is missing from the profile is said, and nothing can be sent", async () => {
    mocks.preview.mockResolvedValue(plan({ problems: ["Add this chamber's name or address in Settings → Chambers before sending SMS."], recipients: 0, segments: 0, cost: 0, canSend: false }));
    open();
    await choose("English");
    expect(screen.getByText("Add this chamber's name or address in Settings → Chambers before sending SMS.")).toBeTruthy();
    expect((screen.getByRole("button", { name: /^Send 0 SMS/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("names the chamber whose queue this is, and sends no chamber of its own (X-Chamber is the queue's)", async () => {
    mocks.preview.mockResolvedValue(plan({ chamber: { id: "c2", name: "Ibn Sina", address: "Kalabagan", text: "Ibn Sina, Kalabagan" } }));
    open();
    await choose("English");
    expect(screen.getByText("Ibn Sina, Kalabagan")).toBeTruthy();
    expect(mocks.preview).toHaveBeenCalledWith({ date: DAY, language: "en" });
    fireEvent.click(screen.getByRole("button", { name: "Send 2 SMS (2 taka)" }));
    await screen.findByRole("list", { name: "Results" });
    expect(mocks.send).toHaveBeenCalledWith({ date: DAY, language: "en", previewSignature: "sig" });
  });

  it("⚕️ the same SMS again within 30 minutes asks 'Send again' first", async () => {
    mocks.send.mockRejectedValueOnce(new ApiError(409, "2 of these patients were sent this same SMS 3 minutes ago. Sent again, they will get it twice.", "SMS_REPEAT"));
    open();
    await choose("English");
    fireEvent.click(screen.getByRole("button", { name: "Send 2 SMS (2 taka)" }));
    await screen.findByRole("list", { name: "Results" });
    expect(mocks.confirmAction).toHaveBeenCalledWith(expect.objectContaining({ title: "Send these SMS again?", confirmLabel: "Send again", danger: true }));
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[1][0]).toMatchObject({ confirmRepeat: true });
  });

  it("'Send again' answered no: nothing is sent", async () => {
    mocks.send.mockRejectedValueOnce(new ApiError(409, "1 of these patients were sent this same SMS.", "SMS_REPEAT"));
    mocks.confirmAction.mockResolvedValue(false);
    open();
    await choose("English");
    fireEvent.click(screen.getByRole("button", { name: "Send 2 SMS (2 taka)" }));
    await waitFor(() => expect(mocks.confirmAction).toHaveBeenCalled());
    await screen.findByRole("button", { name: "Send 2 SMS (2 taka)" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("a refusal in the server's words is shown in a box, and the SMS are checked again", async () => {
    mocks.send.mockRejectedValueOnce(new ApiError(400, "Not enough SMS balance.", "SMS_BALANCE"));
    open();
    await choose("English");
    fireEvent.click(screen.getByRole("button", { name: "Send 2 SMS (2 taka)" }));
    await waitFor(() => expect(mocks.tell).toHaveBeenCalledWith({ title: "SMS not sent", body: "Not enough SMS balance.", tone: "danger" }));
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(2));
  });

  it("⚕️ no answer: says the SMS MAY have gone, and never sends again by itself", async () => {
    mocks.send.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    open();
    await choose("English");
    fireEvent.click(screen.getByRole("button", { name: "Send 2 SMS (2 taka)" }));
    await screen.findByText(/may have been sent/);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.tell).not.toHaveBeenCalled();
  });

  it("Send pressed twice goes once", async () => {
    let finish: (v: unknown) => void = () => {};
    mocks.send.mockReturnValue(new Promise((r) => { finish = r; }));
    open();
    await choose("English");
    const button = screen.getByRole("button", { name: "Send 2 SMS (2 taka)" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    finish(answer);
    await screen.findByRole("list", { name: "Results" });
  });

  it("does not close while the SMS are going", async () => {
    mocks.send.mockReturnValue(new Promise(() => {}));
    const { onClose } = open();
    await choose("English");
    fireEvent.click(screen.getByRole("button", { name: "Send 2 SMS (2 taka)" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  describe("keyboard", () => {
    itKeepsTheKeyboard({
      label: "Send SMS to all patients",
      render: (onClose) => withQuery(<OpdSmsDialog day={DAY} onClose={onClose} onBuy={vi.fn()} />),
    });
  });
});
