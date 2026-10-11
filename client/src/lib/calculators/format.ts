// ⚕️ A calculator's result, written the same on every machine.
//
// `n.toLocaleString()` with no locale follows the BROWSER's language, not the
// app's. An absolute neutrophil count of 1500 is "1,500" in an English browser,
// "1.500" in a German one — which an English-reading doctor takes for one and a
// half — "1 500" in French, "১,৫০০" in Bangla and "١٬٥٠٠" in Arabic. Nothing
// about the patient changed; only the laptop did.
//
// This names the locale, so every browser shows the text a US-English one
// always has: 1,500. It is the same text the results were written and checked
// with — no formula, value, unit or sentence is different. For a browser set
// to US, UK or Australian English nothing changes at all. One set to Indian
// English grouped 100,000 and over the lakh way (1,50,000) and now writes
// 150,000; of the calculators that use this, only a very high ANC reaches it.
//
// It matters beyond the screen: "Add result" files the calculator's sentence
// as the finding, and it prints.
export const grouped = (n: number): string => n.toLocaleString("en-US");
