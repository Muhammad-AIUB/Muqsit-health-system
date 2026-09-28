// @vitest-environment jsdom
//
// ⚕️ A half-typed note or an attached photo belongs to the patient it was
// written for. Switching patient under a mounted chat must not carry either
// into the next patient's team thread.

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PatientChat from "./PatientChat";

const sendMock = vi.fn((_pid: string, _input: unknown) => Promise.resolve());
vi.mock("@/hooks/useChat", () => ({
  usePatientChat: () => ({ data: [], isLoading: false }),
  useSendChat: (pid: string) => ({ isPending: false, mutateAsync: (input: unknown) => sendMock(pid, input) }),
}));
let resolveUpload: (url: string) => void = () => {};
vi.mock("@/lib/api", () => ({
  uploadImage: () => new Promise<string>((r) => { resolveUpload = r; }),
}));
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ({ currentPatientId: null, ptName: "" }) }));

afterEach(() => { cleanup(); sendMock.mockClear(); });

const box = () => screen.getByPlaceholderText(/Write a message/) as HTMLTextAreaElement;

describe("PatientChat — nothing crosses a patient switch", () => {
  it("drops the half-typed note when the patient changes", () => {
    const { rerender } = render(<PatientChat patientId="A" patientName="Patient A" />);
    fireEvent.change(box(), { target: { value: "A's CT looks worse" } });
    rerender(<PatientChat patientId="B" patientName="Patient B" />);
    expect(box().value).toBe("");
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("ignores an upload that finishes after the patient changed", async () => {
    const { container, rerender } = render(<PatientChat patientId="A" patientName="Patient A" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "a-xray.jpg", { type: "image/jpeg" })] } });
    rerender(<PatientChat patientId="B" patientName="Patient B" />);
    await act(async () => { resolveUpload("https://cdn.example/a-xray.jpg"); });
    expect(screen.queryByText(/a-xray\.jpg/)).toBeNull();
  });

  it("keeps an upload for the same patient", async () => {
    const { container } = render(<PatientChat patientId="A" patientName="Patient A" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "a-xray.jpg", { type: "image/jpeg" })] } });
    await act(async () => { resolveUpload("https://cdn.example/a-xray.jpg"); });
    expect(screen.getByText(/a-xray\.jpg/)).toBeTruthy();
  });
});
