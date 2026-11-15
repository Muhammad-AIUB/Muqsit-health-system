# Validation and DTOs

> **Read this before changing the code it covers.** Named in these rules: `src/*/dto/*.ts`, `main.ts`, `patients.service.ts#update`, `Prisma.DbNull`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from the root `CLAUDE.md` and `server/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- A client field is never added without adding it to the DTO — otherwise it is "saved" and silently dropped.
- `ValidationPipe({ whitelist: true })`: any new client field must be added to the DTO or it is silently dropped; JSON columns follow `patients.service.ts#update` (`InputJsonValue`, `DbNull`).

---

# The rules, in full

## Patterns We Do Not Use

_From the root `CLAUDE.md`._

- We do not add a client field without adding it to the DTO — otherwise it is "saved" and silently dropped.

## ⚠️ Rule 3 — ValidationPipe strips unknown fields

_From `server/CLAUDE.md`._

`main.ts` uses `ValidationPipe({ whitelist: true })`. **Any new field the client sends must be added to the DTO** (`src/*/dto/*.ts`) or it is silently dropped — a classic "saved but nothing persisted" bug. For JSON columns follow the existing pattern in `patients.service.ts#update`: destructure the field, cast via `Prisma.InputJsonValue`, use `Prisma.DbNull` for explicit nulls.
