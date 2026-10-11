// ⚕️ A calculator's result, written the same on every machine.
//
// `n.toLocaleString()` with no locale follows the BROWSER's language, not the
// app's. An absolute neutrophil count of 1500 is "1,500" in an English browser,
// "1.500" in a German one — which an English-reading doctor takes for one and a
// half — "1 500" in French, "১,৫০০" in Bangla and "١٬٥٠٠" in Arabic. Nothing
// about the patient changed; only the laptop did.
//
// This names the locale, so every browser shows the text an English-language
// one always has: 1,500. It is the same text the results were written and
// checked with — no formula, value, unit or sentence is different, and for a
// browser already set to English nothing changes at all.
export const grouped = (n: number): string => n.toLocaleString("en-US");
