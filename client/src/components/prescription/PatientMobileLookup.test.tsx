// @vitest-environment jsdom
//
// "This number does not belong to the patient": Save creates the patient and
// then links the number owner. If the link fails, pressing Save again must not
// create the same patient a second time.

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PatientMobileLookup from "./PatientMobileLookup";

const create = vi.fn();
const link = vi.fn();
const get = vi.fn();
vi.mock("@/lib/api", () => ({
  patientsApi: {
    byMobile: () => Promise.resolve([]),
    relativesByMobile: () => Promise.resolve([]),
    create: (...a: unknown[]) => create(...a),
    link: (...a: unknown[]) => link(...a),
    get: (...a: unknown[]) => get(...a),
  },
}));
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ({ activeWorkstationId: null }) }));

afterEach(() => { cleanup(); create.mockReset(); link.mockReset(); get.mockReset(); });

async function openNotOwnerModal() {
  const onPick = vi.fn();
  render(<PatientMobileLookup value="01711111111" onChange={() => {}} onPick={onPick} />);
  fireEvent.click(await screen.findByText("Add New", {}, { timeout: 3000 }));
  fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "Rahim" } });
  fireEvent.click(screen.getByLabelText("This number does not belong to the patient"));
  fireEvent.change(screen.getByPlaceholderText("Number owner's name"), { target: { value: "Karim" } });
  fireEvent.click(screen.getByText("Father"));
  return onPick;
}

describe("PatientMobileLookup — Add New, number belongs to someone else", () => {
  it("⚕️ a retry after a failed link does not create the patient twice", async () => {
    create.mockResolvedValue({ id: "p1", name: "Rahim" });
    link.mockRejectedValueOnce(new Error("Network down")).mockResolvedValueOnce({ newPatient: { id: "o1" } });
    get.mockResolvedValue({ id: "p1", name: "Rahim" });
    const onPick = await openNotOwnerModal();

    await act(async () => { fireEvent.click(screen.getByText("Save")); });
    await screen.findByText("Network down");
    await act(async () => { fireEvent.click(screen.getByText("Save")); });

    await waitFor(() => expect(onPick).toHaveBeenCalledWith({ id: "p1", name: "Rahim" }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(link).toHaveBeenCalledTimes(2);
    expect(link.mock.calls[1][0]).toMatchObject({ existingId: "p1" });
  });

  it("changing the patient's name after a failed link starts a fresh create", async () => {
    create.mockResolvedValue({ id: "p1", name: "Rahim" });
    link.mockRejectedValue(new Error("Network down"));
    await openNotOwnerModal();

    await act(async () => { fireEvent.click(screen.getByText("Save")); });
    await screen.findByText("Network down");
    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "Rahima" } });
    await act(async () => { fireEvent.click(screen.getByText("Save")); });

    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  });
});
