"use client";

import { useEffect, useRef, useState } from "react";
import { C, font } from "@/theme";
import { shadowCard, shadowMenu } from "@/theme/styles";
import { useAuth } from "@/context/AuthContext";
import { applyBanglaKey, PHONETIC_KEY, type WordState } from "@/lib/banglaInput";
import { savedKbdLang, setKbdLang, useKbdLang, type KbdLang } from "@/lib/kbdLang";

// BAN / EN — the header switch and the keyboard handler behind it
// (physician's decision, 2026-09-23). The conversion rules and why they never
// touch a number live in `lib/banglaInput.ts`.
//
// A field opts in by carrying `data-bangla="on"` (see BANGLA_ATTR). The list
// the physician named: Chief complaints, Previous complaints, Note, Plan,
// Advice, and the ℞ pad's dose / food / duration. In BAN mode every OTHER field
// keeps typing English and says so once — silently typing Bangla into a medicine
// search or a date would just find nothing.

// The mode store lives in `lib/kbdLang.ts` (the ℞ pad reads it too). Re-exported
// so existing imports keep working; the app changes mode only through the switch.
export { setKbdLang, type KbdLang } from "@/lib/kbdLang";

// ── Header switch ─────────────────────────────────────────────
export function LanguageToggle() {
  const { user } = useAuth();
  const lang = useKbdLang();

  // Restore this user's last choice; anything unreadable is English.
  useEffect(() => { setKbdLang(savedKbdLang(user?.id)); }, [user?.id]);

  const opt = (value: KbdLang, label: string, title: string) => {
    const active = lang === value;
    return (
      <button
        type="button"
        onClick={() => setKbdLang(value, user?.id)}
        aria-pressed={active}
        title={title}
        style={{
          padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: font,
          fontSize: 11, fontWeight: active ? 700 : 400, lineHeight: 1.3, whiteSpace: "nowrap",
          background: active ? C.pri[50] : "transparent",
          color: active ? C.pri[600] : C.n[500],
          border: active ? `1px solid ${C.pri[400]}` : "1px solid transparent",
          boxShadow: active ? shadowCard : "none",
        }}
      >{label}</button>
    );
  };

  return (
    <div role="group" aria-label="Typing language" style={{ display: "flex", gap: 2, padding: 2, borderRadius: 8, background: C.n[100], flexShrink: 0 }}>
      {opt("bn", "BAN", "Type Bangla phonetically (Avro style: ami → আমি) in Chief complaints, Previous complaints, Note, Plan, Advice and the ℞ dose / food / duration")}
      {opt("en", "EN", "Type English")}
    </div>
  );
}

// ── Keyboard handler ──────────────────────────────────────────

// Write a value into a React-controlled field the way typing would: through the
// native setter (React ignores a plain `.value =` it did not see), then an
// `input` event so the field's own onChange runs and its state stays the truth.
function writeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string, caret: number) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.setSelectionRange(caret, caret);
}

const TEXT_TYPES = new Set(["text", "search", ""]);
function textField(t: EventTarget | null): HTMLInputElement | HTMLTextAreaElement | null {
  if (t instanceof HTMLTextAreaElement) return t.readOnly || t.disabled ? null : t;
  if (t instanceof HTMLInputElement && TEXT_TYPES.has(t.getAttribute("type") ?? "")) return t.readOnly || t.disabled ? null : t;
  return null;
}

/** Mounted once in the shell. Renders only the "not in this field" notice. */
export function BanglaTyping() {
  const lang = useKbdLang();
  const [notice, setNotice] = useState(false);
  // The word being typed, per field — a field that loses the caret and gets it
  // back simply starts a new word (applyBanglaKey checks the text is unchanged).
  const words = useRef(new WeakMap<Element, WordState | null>());
  const warned = useRef<Element | null>(null);

  useEffect(() => {
    if (lang !== "bn") { setNotice(false); return; }
    let hide: ReturnType<typeof setTimeout> | undefined;

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const el = textField(e.target);
      if (!el) return;

      if (el.getAttribute("data-bangla") !== "on") {
        // English is typed as usual; say once per visit to the field why.
        if (PHONETIC_KEY.test(e.key) && warned.current !== el) {
          warned.current = el;
          setNotice(true);
          clearTimeout(hide);
          hide = setTimeout(() => setNotice(false), 4000);
        }
        return;
      }

      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      const r = applyBanglaKey(el.value, start, end, e.key, words.current.get(el) ?? null);
      if (!r) { words.current.set(el, null); return; }
      e.preventDefault();
      words.current.set(el, r.state);
      writeValue(el, r.value, r.caret);
    };
    // A click moves the caret: the next letter starts a new word there.
    const onPointer = (e: Event) => { const el = textField(e.target); if (el) words.current.set(el, null); };
    const onFocus = (e: Event) => { if (warned.current && e.target !== warned.current) warned.current = null; };

    // Capture phase: the conversion must land before the field's own Enter
    // handler reads its value.
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onPointer, true);
    document.addEventListener("focusin", onFocus, true);
    return () => {
      clearTimeout(hide);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onPointer, true);
      document.removeEventListener("focusin", onFocus, true);
    };
  }, [lang]);

  if (!notice) return null;
  return (
    <div role="status" style={{
      position: "fixed", top: "calc(env(safe-area-inset-top, 0px) + 14px)", left: "50%", transform: "translateX(-50%)",
      zIndex: 3000, maxWidth: "min(560px, 92vw)", padding: "10px 16px", borderRadius: 10,
      background: C.warn[50], border: `1px solid ${C.warn[400]}`, color: C.warn[800],
      boxShadow: shadowMenu, fontFamily: font, fontSize: 12.5, fontWeight: 600, lineHeight: 1.45,
    }}>
      Bangla typing is not allowed in this field
    </div>
  );
}
