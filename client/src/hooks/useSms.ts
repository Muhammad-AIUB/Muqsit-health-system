"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { smsApi, type PaymentRequestInput } from "@/lib/api";

const SMS_KEY = ["sms"] as const;

// The practice's SMS balance. Asked whatever the browser says about being
// online, so a failure is said rather than read as an empty wallet.
export function useSmsWallet(enabled = true) {
  return useQuery({ queryKey: [...SMS_KEY, "wallet"], queryFn: smsApi.wallet, enabled, networkMode: "always" });
}

export function useSmsLedger(enabled = true) {
  return useQuery({ queryKey: [...SMS_KEY, "ledger"], queryFn: smsApi.ledger, enabled, networkMode: "always" });
}

export function usePaymentRequests(enabled = true) {
  return useQuery({ queryKey: [...SMS_KEY, "requests"], queryFn: smsApi.paymentRequests, enabled, networkMode: "always" });
}

export function useCreatePaymentRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PaymentRequestInput) => smsApi.createPaymentRequest(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: SMS_KEY }),
  });
}

// After a send the balance and the ledger have moved.
export function useInvalidateSms() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: SMS_KEY });
}
