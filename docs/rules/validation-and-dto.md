# Validation and DTOs

> **Read this before changing the code it covers.** Named in these rules: `src/*/dto/*.ts`, `main.ts`, `patients.service.ts#update`, `Prisma.DbNull`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from the root `CLAUDE.md` and `server/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- A client field is never added without adding it to the DTO — otherwise it is "saved" and silently dropped.
- `ValidationPipe({ whitelist: true })`: any new client field must be added to the DTO or it is silently dropped; JSON columns follow `patients.service.ts#update` (`InputJsonValue`, `DbNull`).
- A free-form nested object is never a DTO property when its KEYS are the user's: `class-transformer` crashes (500) on an own `constructor` key and silently drops `constructor` / `__proto__` — read it `@Body('field')` raw and let the service judge it (`PUT /admin/users/:id/point-scores`).

---

# The rules, in full

## Patterns We Do Not Use

_From the root `CLAUDE.md`._

- We do not add a client field without adding it to the DTO — otherwise it is "saved" and silently dropped.

## ⚠️ Rule 3 — ValidationPipe strips unknown fields

_From `server/CLAUDE.md`._

`main.ts` uses `ValidationPipe({ whitelist: true })`. **Any new field the client sends must be added to the DTO** (`src/*/dto/*.ts`) or it is silently dropped — a classic "saved but nothing persisted" bug. For JSON columns follow the existing pattern in `patients.service.ts#update`: destructure the field, cast via `Prisma.InputJsonValue`, use `Prisma.DbNull` for explicit nulls.

## A nested object whose keys the user chooses (22/11/2026)

`app.setup.ts` runs `ValidationPipe({ whitelist: true, transform: true })`, and `transform` runs `class-transformer`'s `plainToClass` over a DTO's nested plain objects. For an object with an OWN `constructor` key — `{"scores":{"constructor":5}}` — `TransformOperationExecutor` takes `value.constructor` (the number 5) as the class to build and throws `Cannot read properties of undefined (reading 'constructor')`: a 500 with a stack in the log, instead of the 400 the route promises. (With a `@Type(() => Object)` it would not crash, but line 155 of that file then skips `__proto__` / `constructor` keys silently — an unknown key accepted, not refused.) Found by `admin-doctor.int-spec.ts` the first time it was run. So the Point system's route takes `@Body('scores') scores: unknown` — a built-in type the pipe leaves alone — and `point-system.ts#checkScores` is the one judge of the whole value (`{}`, `null`, an array and a string are 400 there too). Not checked, and pre-existing: other routes whose DTO has a nested free-form object (the JSON columns of a patient, IPD `clinical`) very likely answer 500 to a `constructor` key in the same way — a refused request, no data written; left as it is.
