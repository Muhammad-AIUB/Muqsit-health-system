# AI tooling

> **Read this before changing the code it covers.** Named in these rules: —.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from the root `CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- The ECC plugin is never enabled in this repo: its hooks have not been checked against these safety rules.
- The Fable model (`claude-fable-5-1`) is never used for this app — main session, subagent, fork or review: set a subagent's `model` explicitly (`sonnet` or `opus`); a session found running on Fable says so and stops.

---

# The rules, in full

## Patterns We Do Not Use

_From the root `CLAUDE.md`._

- We do not enable the ECC plugin in this repo. Its hooks have not been checked against these safety rules.
- We do not ever use the Fable model (`claude-fable-5-1`) for this app — not in the main session, not in a subagent, not in a fork, not in a review. Product owner's standing instruction, 29/10/2026; no further reason was given. When starting a subagent, set `model` explicitly (`sonnet` or `opus`) rather than relying on the default, and if a session turns out to be running on Fable, say so and stop before touching code.
