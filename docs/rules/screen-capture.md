# Screen capture (screenshots and recording)

Owner decision, 2026-11-23: the doctor app tries to deter screenshots and screen recording. **Production only**, everyone, **not the admin site**. Prescription Save & print / PDF stays allowed (it is the legal document, not a capture).

## At a glance
- A web page cannot block OS capture or a phone camera; the guard hides the screen and watermarks it so a leak is traceable. Never claim more.
- `ScreenGuard` (`client/src/components/common/ScreenGuard.tsx`) is mounted once in `Muqsit.tsx`; it is active only when `NODE_ENV === 'production'` and `NEXT_PUBLIC_SCREEN_GUARD !== 'off'`.
- Focus moving into an `<iframe>` (the Save & print sheet) is not a capture and never covers the page.
- Typing boxes keep text selection and the context menu.

## The rules, in full
1. **Production only.** `next dev` (including the E2E run, which uses `next dev`) never renders it, so tests and Playwright are unaffected. Reason: the owner asked for it; a guard that hides the page would break development.
2. **The print path is untouched.** `prescriptionDoc.ts` and `PrintSheetModal` are not changed; the guard's watermark/cover carry `data-screen-guard` and are `display:none` in `@media print`. Reason: print is a legal document (PRIME DIRECTIVE 4).
3. **Blur is not always a capture.** The cover ignores a window blur when `document.activeElement` is an IFRAME, or the print sheet would hide itself the moment the doctor clicked in it.
4. **The watermark is the real protection.** Doctor name, id, date/time through `lib/stamp.ts`; colours from `C`; `pointer-events:none`.
5. **Admin is excluded** by decision; nothing under `admin/` mounts it.
6. **Known limits:** OS tools that do not take focus, phone cameras, and a doctor who disables JavaScript. A native wrapper (Android `FLAG_SECURE`, Electron content protection) is the only way to block, and is not built.
