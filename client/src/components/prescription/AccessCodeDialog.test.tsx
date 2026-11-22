// @vitest-environment jsdom
//
// Opening another practice's patient with the patient's own code (physician's
// sheet, 16/11/2026): the box where the doctor asks for the code and types it.
// The server counts the tries and the minutes; these pin what the doctor is told
// and where the box goes next.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { itKeepsTheKeyboard } from "@/test/dialogKeyboard";

const mocks = vi.hoisted(() => ({
  requestCode: vi.fn(),
  verify: vi.fn(),
  get: vi.fn(),
}));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  patientAccessApi: { requestCode: mocks.requestCode, verify: mocks.verify, search: vi.fn() },
  patientsApi: { get: mocks.get },
}));

import { ApiError } from "@/lib/api";
import AccessCodeDialog from "./AccessCodeDialog";

const PATIENT = { id: "p1", name: "Rahima Begum", sex: "Female", age: 34 };
const OPENED = { id: "p1", name: "Rahima Begum" };

function mount(onOpened = vi.fn(), onClose = vi.fn()) {
  render(<AccessCodeDialog patient={PATIENT} onClose={onClose} onOpened={onOpened as never} />);
  return { onOpened, onClose };
}
const sendCode = async () => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send code" })); }); };
const typeCode = (v: string) => fireEvent.change(screen.getByLabelText("Code from the patient"), { target: { value: v } });
const openBtn = () => screen.getByRole("button", { name: /Open patient|Checking/ });

beforeEach(() => {
  mocks.requestCode.mockResolvedValue({ sentTo: "017*****678", expiresInSeconds: 600, resendAfterSeconds: 60 });
  mocks.verify.mockResolvedValue({ ok: true, patientId: "p1" });
  mocks.get.mockResolvedValue(OPENED);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("AccessCodeDialog — asking for the code", () => {
  it("shows who it is, says the patient has to agree, and sends nothing until Send code is pressed", () => {
    mount();
    expect(screen.getByText("Open Rahima Begum")).toBeTruthy();
    expect(screen.getByText("34y · Female")).toBeTruthy();
    expect(screen.getByText(/another doctor's list/)).toBeTruthy();
    expect(mocks.requestCode).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Code from the patient")).toBeNull();
  });

  it("Send code asks the server for THIS patient and moves on to the code box, naming where it went", async () => {
    mount();
    await sendCode();
    expect(mocks.requestCode).toHaveBeenCalledTimes(1);
    expect(mocks.requestCode).toHaveBeenCalledWith("p1");
    expect(await screen.findByLabelText("Code from the patient")).toBeTruthy();
    expect(screen.getByText("017*****678")).toBeTruthy();
  });

  it("a failed send says why, in the server's words, and stays on the first step", async () => {
    mocks.requestCode.mockRejectedValue(new ApiError(503, "The text message service is not set up on this server, so the patient's code cannot be sent.", "SMS_NOT_CONFIGURED"));
    mount();
    await sendCode();
    expect((await screen.findByRole("alert")).textContent).toContain("not set up");
    expect(screen.queryByLabelText("Code from the patient")).toBeNull();
    expect(screen.getByRole("button", { name: "Send code" })).toBeTruthy(); // can try again
  });

  it("a code that was just sent goes on to the code box (it is on the patient's phone)", async () => {
    mocks.requestCode.mockRejectedValue(new ApiError(429, "A code was just sent. You can ask for another in 40 seconds.", "CODE_COOLDOWN"));
    mount();
    await sendCode();
    expect(await screen.findByLabelText("Code from the patient")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("just sent");
  });

  it("'I already have a code' goes to the code box without sending another", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "I already have a code" }));
    expect(screen.getByLabelText("Code from the patient")).toBeTruthy();
    expect(mocks.requestCode).not.toHaveBeenCalled();
  });

  it("a lost connection is never shown raw", async () => {
    mocks.requestCode.mockRejectedValue(new TypeError("Failed to fetch"));
    mount();
    await sendCode();
    expect((await screen.findByRole("alert")).textContent).not.toContain("Failed to fetch");
  });

  it("Send code cannot be pressed twice while it is going out", async () => {
    let release: (v: unknown) => void = () => {};
    mocks.requestCode.mockReturnValue(new Promise((r) => { release = r; }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    const busy = await screen.findByRole("button", { name: "Sending…" });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(busy);
    expect(mocks.requestCode).toHaveBeenCalledTimes(1);
    await act(async () => { release({ sentTo: "017*****678", expiresInSeconds: 600, resendAfterSeconds: 60 }); });
  });
});

describe("AccessCodeDialog — entering the code", () => {
  const toCodeBox = async () => { mount(); await sendCode(); await screen.findByLabelText("Code from the patient"); };

  it("Open patient waits for a whole code: five digits and a letter are not one", async () => {
    await toCodeBox();
    for (const v of ["", "48291", "48291a", "4829133", "abcdef"]) {
      typeCode(v);
      expect((openBtn() as HTMLButtonElement).disabled).toBe(true);
    }
    typeCode("482913");
    expect((openBtn() as HTMLButtonElement).disabled).toBe(false);
  });

  it("says the code is six digits once something that is not a code is typed (and nothing before)", async () => {
    await toCodeBox();
    expect(screen.queryByText(/The code is 6 digits/)).toBeNull();
    typeCode("48");
    expect(screen.getByText(/The code is 6 digits/)).toBeTruthy();
    typeCode("482913");
    expect(screen.queryByText(/The code is 6 digits/)).toBeNull();
  });

  it("a code pasted with a space ('482 913') is sent as typed digits, and the patient is then opened", async () => {
    const onOpened = vi.fn();
    render(<AccessCodeDialog patient={PATIENT} onClose={vi.fn()} onOpened={onOpened as never} />);
    await sendCode();
    await screen.findByLabelText("Code from the patient");
    typeCode("482 913");
    await act(async () => { fireEvent.click(openBtn()); });
    await waitFor(() => expect(onOpened).toHaveBeenCalledWith(OPENED));
    expect(mocks.verify).toHaveBeenCalledWith("p1", "482913");
    expect(mocks.get).toHaveBeenCalledWith("p1");
  });

  it("Enter in the box presses Open patient", async () => {
    await toCodeBox();
    typeCode("482913");
    await act(async () => { fireEvent.submit(screen.getByLabelText("Code from the patient").closest("form")!); });
    expect(mocks.verify).toHaveBeenCalledTimes(1);
  });

  it("⚕️ the patient is NOT opened by a wrong code: the box says so, with the tries left, and keeps what was typed", async () => {
    mocks.verify.mockRejectedValue(new ApiError(400, "That code is not right. 3 tries left.", "WRONG_CODE"));
    const onOpened = vi.fn();
    render(<AccessCodeDialog patient={PATIENT} onClose={vi.fn()} onOpened={onOpened as never} />);
    await sendCode();
    await screen.findByLabelText("Code from the patient");
    typeCode("111111");
    await act(async () => { fireEvent.click(openBtn()); });
    expect((await screen.findByRole("alert")).textContent).toContain("3 tries left");
    expect(onOpened).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled(); // the record is not even read
    expect((screen.getByLabelText("Code from the patient") as HTMLInputElement).value).toBe("111111");
  });

  it("typing again clears the old complaint", async () => {
    mocks.verify.mockRejectedValue(new ApiError(400, "That code is not right. 3 tries left.", "WRONG_CODE"));
    await toCodeBox();
    typeCode("111111");
    await act(async () => { fireEvent.click(openBtn()); });
    await screen.findByRole("alert");
    typeCode("11111");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("an expired or used-up code sends the doctor back to ask for a new one", async () => {
    mocks.verify.mockRejectedValue(new ApiError(429, "Too many wrong tries with this code. Ask for a new one.", "CODE_LOCKED"));
    await toCodeBox();
    typeCode("111111");
    await act(async () => { fireEvent.click(openBtn()); });
    expect((await screen.findByRole("alert")).textContent).toContain("Ask for a new one");
    expect(screen.getByRole("button", { name: "Send code" })).toBeTruthy();
    expect(screen.queryByLabelText("Code from the patient")).toBeNull();
  });

  it("a new code cannot be asked for at once: the button counts down from the server's wait", async () => {
    await toCodeBox();
    const again = screen.getByRole("button", { name: /Send a new code/ }) as HTMLButtonElement;
    expect(again.disabled).toBe(true);
    expect(again.textContent).toMatch(/\(\d+s\)/);
  });

  it("a connection lost AFTER the code was right keeps the code box, and trying again opens the patient", async () => {
    // The server has already opened the patient (the code is spent); only reading the record failed.
    mocks.get.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(OPENED);
    const onOpened = vi.fn();
    render(<AccessCodeDialog patient={PATIENT} onClose={vi.fn()} onOpened={onOpened as never} />);
    await sendCode();
    await screen.findByLabelText("Code from the patient");
    typeCode("482913");
    await act(async () => { fireEvent.click(openBtn()); });
    expect((await screen.findByRole("alert")).textContent).toMatch(/internet connection/);
    expect(onOpened).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(openBtn()); });
    await waitFor(() => expect(onOpened).toHaveBeenCalledWith(OPENED));
  });

  it("Open patient cannot be pressed twice while it is checking", async () => {
    let release: (v: unknown) => void = () => {};
    mocks.verify.mockReturnValue(new Promise((r) => { release = r; }));
    await toCodeBox();
    typeCode("482913");
    fireEvent.click(openBtn());
    const busy = await screen.findByRole("button", { name: "Checking…" });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(busy);
    expect(mocks.verify).toHaveBeenCalledTimes(1);
    await act(async () => { release({ ok: true, patientId: "p1" }); });
  });

  it("Cancel closes without asking or checking anything", () => {
    const { onClose } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mocks.requestCode).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });
});

describe("AccessCodeDialog — keyboard", () => {
  itKeepsTheKeyboard({
    label: "Open Rahima Begum with the patient's code",
    render: (onClose) => <AccessCodeDialog patient={PATIENT} onClose={onClose} onOpened={vi.fn() as never} />,
  });
});
