# BAN turns the ℞ pad's dose / food / duration into Bangla — design

- Date: 2026-10-14
- Asked for by the physician (product owner); design approved in chat the same day.
- Status: approved, not yet built.

## What it is

With **BAN** selected, the OPD ℞ pad's three instruction columns — dose,
food, duration — are written in Bangla, and are saved and printed that way.
With **EN** selected they are English again, saved and printed so. Only these
three columns; nothing else on the screen changes language.

## Decisions (physician, 2026-10-14)

1. **The text itself changes**, both ways. BAN writes Bangla into the cells;
   EN writes English back. Saved and printed as it stands.
2. **Everything Bangla — digits too.** `1+0+1` is `১+০+১`, `2 month` is
   `২ মাস`. This reverses the 2026-09-23 rule "a number is never converted"
   for these three cells, on the physician's explicit confirmation. A
   decimal point stays a point: `0.5` is `০.৫`, never `০।৫` (the dari was the
   reason for the old rule).
3. **The wording, approved word for word:**

   | English | Bangla |
   |---|---|
   | Before meal | খাবারের আগে |
   | After meal | খাবারের পরে |
   | With food | খাবারের সাথে |
   | N hr before meal | খাবারের N ঘণ্টা আগে |
   | N hr after meal | খাবারের N ঘণ্টা পরে |
   | N hr before or after meal | খাবারের N ঘণ্টা আগে বা পরে |
   | Continue | চলবে |
   | N days | N দিন |
   | N week | N সপ্তাহ |
   | N month | N মাস |
   | at night | রাতে |

4. **Anything not in the list stays exactly as written.** No guessing at
   free text.

## When the text is converted

- **Pressing BAN or EN** converts every line on the pad to that language.
- **Typing in BAN mode** — a cell is converted when it is committed: on blur
  or Enter, at the same moment the shorthand (`101` → `1+0+1`) is expanded.
  While typing, digits show as keyed (the keyboard handler is unchanged).
- **Lines that arrive** from "Your usual", Add Bulk Medicine, a template or
  Drug history's Move to Rx are written in the current language.
- **Not converted:** a pad that arrives from another device (the device
  mirror) or a reloaded draft. Each device keeps its own BAN/EN; converting on
  arrival would turn the same lines back and forth between two devices that
  disagree.
- OPD only — the IPD order sheet, the Drug-history pad and the template editor
  are untouched.

## What stays the same underneath

- **"The same instruction" is asked across languages.** `instructionKey`
  reads a cell with Bangla in it as its English equivalent first, so
  `খাবারের আগে` and `Before meal`, `১+০+১` and `1+0+1`, are one instruction
  for Move to Rx's and Add Bulk Medicine's "already on ℞". An English cell is
  compared exactly as before (capitals and spaces only).
- **Monthly cost** reads a Bangla cell as its English equivalent before
  pricing it.

## Known limits

- **Shorthand does not work in BAN** (`bm`, `7d`): the letters are already
  Bangla when they are typed. Unchanged from 2026-09-23 — switch to EN.
- **"Your usual" learns Bangla and English instructions as two habits**, and
  the distinct-patient count of one dose is split between them. Closing it
  needs the server's habit key to read both languages as one — described for
  the developer after the build, not done here.
- A round trip writes the app's own English: `2 weeks` → `২ সপ্তাহ` →
  `2 week`. Same meaning; the doctor's exact English spelling is not kept.

## Client

| Unit | Purpose |
|---|---|
| `lib/rxLanguage.ts` *(new)* | pure: one cell, one ℞ item list, one habit, in a language |
| `lib/kbdLang.ts` *(new)* | the BAN/EN mode store, moved out of `BanglaTyping.tsx` so the pad can read it |
| `BanglaTyping.tsx` | the switch converts `rxItems` when pressed |
| `MedicinePad.tsx` | commit in BAN converts a cell; a "Your usual" pick lands in the current language |
| `RightColumn.tsx` | template and bulk lines land in the current language |
| `DrugHistoryField.tsx` | Move to Rx lines land in the current language |
| `medicineKey.ts` | `instructionKey` reads Bangla as English |
| `monthlyCost.ts` | prices Bangla cells |

## Testing

`rxLanguage.test.ts` (table both ways, digits, decimal point, unknown text,
mixed digits, round trip), `medicineKey.test.ts` (cross-language equality,
English unchanged), `monthlyCost.test.ts` (a Bangla line prices the same),
`BanglaTyping.test.tsx` (the switch converts the pad), a new
`MedicinePad.bangla.test.tsx` (commit converts in BAN, not in EN, not on a pad
that did not opt in). Browser: sandbox, BAN/EN round trip, typing, Preview PDF.
