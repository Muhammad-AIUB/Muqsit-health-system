# Authentication and sessions

> **Read this before changing the code it covers.** Named in these rules: `auth.service.ts#refresh`, `apiFetch`, `mhs_at`, `mhs_rt`, `publicUser()`, `revokeAllForUser`, `ROTATION_GRACE_MS`, `SMTP_HOST`, `SMTP_PASS`, `SMTP_USER`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from `server/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- Access `mhs_at` (15 min) + rotated refresh `mhs_rt` (path `/api/auth`), both httpOnly; `publicUser()` must keep returning `accountTier`.
- Keep the refresh rotation grace window (10 s, same User-Agent only) in `auth.service.ts#refresh`; a different/missing UA is theft; removing it logs everyone out on reload.
- Client `apiFetch` refreshes once on 401 and logs out only on a definitive rejection; keep server semantics compatible.
- How it works — `revokeAllForUser` is the admin evict path; sessions die within one access-token lifetime.
- How it works — Email (OTP, notifications) is nodemailer over SMTP env; without it the transporter is null and signup OTP won't arrive — configuration, not a bug.

---

# The rules, in full

## Auth architecture (don't regress these)

_From `server/CLAUDE.md`._

- Access token `mhs_at` (15 min) + refresh `mhs_rt` (rotated, path `/api/auth`), both httpOnly. `publicUser()` must keep returning `accountTier` — the client's tier gates read it from the login/refresh response.
- **Rotation grace window (10 s, same User-Agent only)** in `auth.service.ts#refresh` (`ROTATION_GRACE_MS`; was 30 s until the CSO pass): a just-rotated token presented again by the SAME browser while the family has a live successor is a benign concurrent-refresh race (multiple tabs / client+admin share the cookie) → issue a fresh token. A different or missing User-Agent inside the window is treated as theft. Only replay after the window, or against a dead family, revokes the family. Removing this brings back the "everyone logs out on reload" bug.
- Client `apiFetch` silently refreshes once on 401 and only logs out on a definitive rejection; keep server semantics compatible.
- `revokeAllForUser` is the admin evict path; sessions die within one access-token lifetime.

## Gotchas

_From `server/CLAUDE.md`._

- Email (OTP verification, notifications) is nodemailer over SMTP — `SMTP_HOST/SMTP_USER/SMTP_PASS` env. Without them the transporter is null (dev): signup OTP won't arrive; that's configuration, not a bug.
