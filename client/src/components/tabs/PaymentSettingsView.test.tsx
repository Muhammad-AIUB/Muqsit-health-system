// @vitest-environment jsdom
//
// Settings → Payment (physician's sheet, 28/10/2026): right after Profile, with
// two options, Renew and Buy SMS. No payment gateway: a request goes to the
// admin, who credits the wallet. No price or package is set by the app.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  assistant: false,
  wallet: vi.fn(),
  ledger: vi.fn(),
  paymentRequests: vi.fn(),
  createPaymentRequest: vi.fn(),
  pathname: "/settings",
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  smsApi: { wallet: mocks.wallet, ledger: mocks.ledger, paymentRequests: mocks.paymentRequests, createPaymentRequest: mocks.createPaymentRequest },
}));
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ({ isAssistantMode: mocks.assistant, setActiveTab: vi.fn() }) }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
// The other settings pages are not under test here.
vi.mock("./ManageAssistantsView", () => ({ default: () => null }));
vi.mock("./ProfileSettingsView", () => ({ default: () => null }));
vi.mock("./PrescriptionSettingsView", () => ({ default: () => null }));
vi.mock("./PrescriptionTemplatesView", () => ({ default: () => null }));
vi.mock("./FavouriteSettingsView", () => ({ default: () => null }));

import PaymentSettingsView from "./PaymentSettingsView";
import SettingsView from "./SettingsView";

vi.setConfig({ testTimeout: 30_000 });

const page = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PaymentSettingsView onBack={vi.fn()} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  mocks.assistant = false;
  mocks.pathname = "/settings";
  mocks.wallet.mockReset().mockResolvedValue({ balance: 42 });
  mocks.ledger.mockReset().mockResolvedValue([
    { id: "l1", delta: -2, reason: "send", ref: "j1", note: "2 SMS (2 messages) for 2026-11-02, English", createdAt: "2026-11-01T10:00:00.000Z" },
    { id: "l2", delta: 50, reason: "topup", ref: "p1", note: null, createdAt: "2026-10-31T10:00:00.000Z" },
  ]);
  mocks.paymentRequests.mockReset().mockResolvedValue([
    { id: "p1", kind: "sms", quantity: 50, amount: 50, note: null, status: "credited", credited: 50, adminNote: null, handledAt: null, createdAt: "2026-10-31T09:00:00.000Z" },
    { id: "p2", kind: "renew", quantity: 1, amount: null, note: null, status: "pending", credited: null, adminNote: null, handledAt: null, createdAt: "2026-11-01T09:00:00.000Z" },
  ]);
  mocks.createPaymentRequest.mockReset().mockResolvedValue({ id: "p3", status: "pending" });
});
afterEach(cleanup);

describe("Settings — the Payment card", () => {
  it("comes right after Profile", () => {
    render(<SettingsView />);
    const titles = Array.from(document.querySelectorAll(".card-press")).map((c) => c.textContent ?? "");
    const profile = titles.findIndex((t) => t.startsWith("Profile"));
    expect(titles[profile + 1]).toMatch(/^Payment/);
  });

  it("/settings/payment opens it", async () => {
    mocks.pathname = "/settings/payment";
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SettingsView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("SMS balance")).toBeTruthy();
  });
});

describe("Settings → Payment", () => {
  it("shows the balance, the requests with their status, and the history", async () => {
    page();
    expect((await screen.findByText("42 taka")).hasAttribute("data-sms-wallet")).toBe(true);
    expect(await screen.findByText("Done · 50 SMS added")).toBeTruthy();
    expect(screen.getByText("Waiting for the admin")).toBeTruthy();
    expect(screen.getByText("Renew subscription · 1 month")).toBeTruthy();
    expect(screen.getByText("Added by admin")).toBeTruthy();
    expect(screen.getByText("-2 taka")).toBeTruthy();
  });

  it("has two options, Renew and Buy SMS, and says the request goes to the admin", async () => {
    page();
    const group = screen.getByRole("group", { name: "Payment options" });
    expect(Array.from(group.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Renew", "Buy SMS"]);
    expect(screen.getByText(/There is no online payment in the app\. Your request goes to the Muqsit admin/)).toBeTruthy();
  });

  it("Buy SMS sends what the doctor typed — no price of the app's", async () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: "Buy SMS" }));
    fireEvent.change(screen.getByLabelText("Number of SMS"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Amount you pay (taka, optional)"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Note for the admin (optional)"), { target: { value: "Paid at the office" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Buy SMS request" }));
    await screen.findByText(/Request sent to the admin/);
    expect(mocks.createPaymentRequest).toHaveBeenCalledWith({ kind: "sms", quantity: 500, amount: 500, note: "Paid at the office" });
  });

  it("⚕️ a number typed in part is not read as its start", async () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: "Buy SMS" }));
    fireEvent.change(screen.getByLabelText("Number of SMS"), { target: { value: "50 0" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Buy SMS request" }));
    expect(screen.getByRole("alert").textContent).toMatch(/whole number/);
    expect(mocks.createPaymentRequest).not.toHaveBeenCalled();
  });

  it("Renew is the monthly subscription: months are optional, and sent as typed", async () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: "Renew" }));
    expect(screen.getByText("Renew your monthly subscription.")).toBeTruthy();
    expect(screen.queryByLabelText("Number of SMS")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send Renew request" }));
    await screen.findByText(/Request sent to the admin/);
    expect(mocks.createPaymentRequest).toHaveBeenLastCalledWith({ kind: "renew" });
  });

  it("Renew with a number of months", async () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: "Renew" }));
    fireEvent.change(screen.getByLabelText("Months to renew (optional)"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Renew request" }));
    await screen.findByText(/Request sent to the admin/);
    expect(mocks.createPaymentRequest).toHaveBeenLastCalledWith({ kind: "renew", quantity: 3 });
  });

  it("an assistant sees the balance and nothing else", async () => {
    mocks.assistant = true;
    page();
    expect(await screen.findByText("Only the doctor can buy SMS, renew, or see the SMS history.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Payment options" })).toBeNull();
    expect(mocks.ledger).not.toHaveBeenCalled();
    expect(mocks.paymentRequests).not.toHaveBeenCalled();
  });

  it("a balance that did not load says so, with Try again", async () => {
    mocks.wallet.mockRejectedValue(new Error("x"));
    page();
    expect(await screen.findByText("Could not load the SMS balance.")).toBeTruthy();
  });
});
