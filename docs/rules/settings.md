# Settings

> **Read this before changing the code it covers.** Named in these rules: `ChambersSettingsView.tsx`, `/settings/chambers`, `PUT /chambers/:id/layout`, `confirmAction`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from `client/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- Settings → Chambers: boxes keep what was typed until the server has it, a save clears only what it sent; Remove asks (`confirmAction`, soft); main chamber has no Remove; assistants read-only.
- Prescription settings "Settings for" a chamber: Save writes to the CHAMBER (`PUT /chambers/:id/layout`), never to General; "Use General settings" asks, then removes the chamber's own.

---

# The rules, in full

## Chambers — "My Chamber" (physician's sheet 28/10/2026, item 8; 01/11/2026)

_From `client/CLAUDE.md`._

- **Settings → Chambers** (`ChambersSettingsView.tsx`, `/settings/chambers`): add, rename, edit address (the boxes keep what was typed until the server has it; a save clears only what it sent), Remove asks first (`confirmAction`, soft on the server). The main chamber has no Remove. An assistant sees it read-only.
- **Prescription settings → "Settings for"** (owner, shown when the practice has more than its main chamber): General or one chamber. A chamber with none of its own starts from General and says so; Save writes to the CHAMBER (`PUT /chambers/:id/layout`), never to General; "Use General settings" asks, then removes the chamber's own. Switching asks first (unsaved changes on the page are left behind).
