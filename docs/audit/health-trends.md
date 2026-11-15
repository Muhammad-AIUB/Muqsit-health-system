# Health monitoring and the trend chart — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/health-trends.md`](../rules/health-trends.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **The "Symptoms · all visits" panel** — Duplicates the chart's "Symptoms shown" column exactly; removing it is a taste call, so it was left.
- **A number typed with a comma is not plotted (`DEFECT-HM-GROUPED`)** — Physician to decide what a typed comma means (`12,000` as twelve thousand? decimal comma?); also `DEFECT-INV-GROUPED` and `DEFECT-HM-SPACED` (`WBC:1, 200/cmm` drawn as 1).
- **Found in the fourth and fifth reviews and left open (2026-10-12)** — Physician's call: chart reads no signed number (T-score `-2.5` gives no point) (+12 more: METs, personal-note limits, `DEFECT-HM-NAMES`, `DEFECT-D4`, space-only result, `invFormData`).
- **Two courses of one medicine: two rows here, ONE bar on the chart** — Gap drawn as taken; bars now run to the End of the course — this changes the bars of patients already on record.

**Closed — kept as the record of what was done or decided**

- **Health-monitoring drug selections (`hmDrugs`)** — Now saved to `Patient.hmSelectedDrugs` (TEXT[]) and loaded on patient open.
- **Health monitoring → "Export Patient's Data" card** — Was decorative; removed (2026-07) rather than left as a button that does nothing on a clinical screen.
- **…and a third time, 2026-10-12** — Unknown dosage forms shortened so the brand stays in sight; free text with a colon is one value; one function reads a stored finding; result boxes name field and test.
- **A count typed `1,200` was drawn on the health-trend chart as 1** — In boxes with no unit `1,200` was drawn as 1; first fix incomplete (`1,200/cmm`), closed in later reviews; record, sidebar and print held what was typed.
- **…and a sixth time, 2026-10-13 — a unit beside the wrong number** — An amount is never cut into (`10 mg+160 mg+25 mg` no longer `10…mg+25 mg`); `Tab Rivotril .5 mg` no longer `5 mg`; stray space in a two-unit box closed; documents corrected.
- **…and a seventh time, 2026-10-13 — phone chart names and "every"** — Strengths compared with other strengths of the same medicine; two-forms case closed; number never shown in part; fixed pools counted (233,688 charts); `\p{…}`/`matchAll` removed.
- **…and an eighth time, 2026-10-13 — a dose change still hidden** — `namesApart` ends with a pass over the strengths of ONE medicine; flaky property traced (27 pairs in two million); `Tab Clonazepam .5 mg` closed; documents corrected.
- **…and a ninth, 2026-10-13 — the fix had cost something** — Strength's line no longer taken from the word that tells medicines apart (`Tablet Exforg…`); pass made order-independent; three sampled cases closed; record corrected.
- **…and a tenth, 2026-10-13 — the guard had holes, and a rule replaced it** — A name keeps its own lines unless the new ones show as much of its medicine's name from its start; counted against the release over 493,920 charts.

---

# The threads, in full

## 1. Not persisted (in-memory only — "save & reload = gone")

- [x] **Health-monitoring drug selections** (`hmDrugs`) — now saved to `Patient.hmSelectedDrugs` (TEXT[]). Loaded on patient open.

## 2. Stub buttons / placeholder views

- [x] **Health monitoring → "Export Patient's Data"** card — was decorative; **removed** (2026-07) rather than left as a button that does nothing on a clinical screen.

## Open threads — decisions owed, not bugs (2026-07-27)

These came out of the health-trend-chart work and its review. Each one is a
**product decision**, deliberately not taken unilaterally. Read the linked
CLAUDE.md section before picking one up.

- [ ] **The "Symptoms · all visits" panel** on the idsp tab now duplicates the
  chart's own "Symptoms shown" column exactly — same source, same list. Removing
  it is a taste call, so it was left. (The "🧪 Lab tests" panel beside it is not
  redundant: it lists *advised* tests, which the chart never plots.)

- [x] **…and a third time, 2026-10-12.** Nothing that touches a record or the
  printed sheet; three things in the fixes again. (1) On a phone's chart a
  dosage form the app does not know by name (`IV Infusion.`, `Oral Saline.`)
  took the whole first line and the brand was cut: it is shortened now and
  the brand stays in sight (`IV Infu… Napa`). The rule was written as what
  it is for — two different medicines not drawn under one name — and put
  under property tests over thousands of names, which found two more slips
  than the examples had. (That it "never" happens was claimed here; it was
  not true — the fourth review, below.) (2) Free text with a colon (`Platelet: 1,50,000`)
  was still shown `1, 50, 000`: a name the catalog does not have is one
  value now, on the evidence of every revision of the catalog (no test
  with several boxes was ever removed or renamed; GCS and Child-Pugh became
  calculators and are listed by name). (3) The rule was tested beside the
  line that applies it: one function reads a stored finding now, and a test
  renders the real panel. Also: every result box says its field AND its
  test (36 shared a name inside one category); the month list closes when
  another device closes the popup.

- [x] **A count typed `1,200` was drawn on the health-trend chart as 1 — found
  in that review, in production until the release that carried this.** Only in a box with no
  unit (eight in the catalog: Ascites Fluid › WBC, the one count; INR, A/G
  ratio, SAAG, TC/HDL, T-score, Z-score and METs). The first fix refused
  `1,200` only with nothing typed after it; the fourth review, below, found
  `1,200/cmm` still drawn as 1. The record, the sidebar and the printed
  sheet held what was typed — except through a two-unit box (the fifth
  review, below).

- [x] **…and a sixth time, 2026-10-13 — nothing that stored or drew a wrong
  number, and one thing every example had hidden.** (1) **On a phone's
  chart a strength could be shown with a unit beside the wrong number.**
  A combination picked from the medicines list has no space round its plus
  — `10 mg+160 mg+25 mg` — and every example in the code, its tests and
  three documents had spaces. (Known from the labels in the tests that came
  from real sheets, `Edeloss 20 mg+50 mg`; the production table was not
  read for this, and the rule now holds for both ways of writing one.) The word a strength parts at was looked for
  between spaces, so of that tablet the chart showed `10…mg+25 mg`, which
  reads as 10 mg + 25 mg: the `mg` beside the 10 was the hidden 160's.
  And a cut fell wherever the line ran out: `12.5 mg + 500 mg` was
  `12.5 mg + 50…`, a 12.5 was `12.…`. Never in production — the two-line
  names are new in this release. Now an AMOUNT, a number with the short
  word after it, is never cut into: a cut backs off to where it begins,
  the part two strengths differ in is shown whole (`10 mg…25 mg` beside
  `10 mg…12.5 mg`; `…500 mg` beside `…1000 mg`), and the line does not
  turn inside one where anything is left off. It is held for any chart by a
  property that finds the amounts with a scan of its own, 20,000 charts a
  run — and on its first runs that property found two more: a hand-typed
  `Tab Rivotril .5 mg` had its decimal point read as the full stop of a
  dosage form and was named `5 mg`, half a milligram shown as five; and a
  part beginning `.5`, set straight after a mark, was four dots in a row
  (`….5 mg`, now `… .5 mg`). (2) **One medicine in two forms and two
  long strengths** could be left with one pair under one name, and the
  other with no strength shown, where the round before had told all four
  apart: the dosage form now comes back over a strength longer than a line
  too, cut between its parts. One case of the kind is left and written down
  (`DEFECT-HM-NAMES`, open list) — closed in the seventh, below. (3) **A stray space in a two-unit box**,
  in the box of the unit that is not the preferred one, was recorded as a
  result with a unit and no value (`S. Creatinine: umol/L`), where before
  this release's rule nothing was. Closed. (4) **What the documents said
  that was not so**, each corrected where it stood: "no step is ever
  undone" (a step is taken only if fewer pairs are alike after it — a pair
  once apart may still be put together again by a later one); "a strength
  cut at its end shows the end where another differs only there" (not at
  16 and 17 letters, until now); that a remark after a comma and a space
  was drawn "as on every version before" (the fourth round had stopped
  drawing those); "Add did nothing" in a two-unit box (it is Enter — a
  test's boxes have no Add); "every one-box test" for the 108 boxes stored
  with no name (nearly every); and the note for the physician in the open
  list, which called every wrong value "far too small" and left out that a
  value could be MISSING. (5) **Listed and left:** a number typed with a
  comma AND a space inside it is still drawn as a piece of itself
  (`DEFECT-HM-SPACED`, as in production); the second unit of the
  fibrinogen box, which is the physician's (open list); and on a WIDE
  screen a name is still one line cut at twenty characters wherever that
  falls — also inside a number (`Tablet. Metformin 5…` for 500 mg) — as
  in production: the phone's two-line rule would close it, and changes the
  look of the chart the physician knows. Checked by breaking the code: 34 deliberate breaks in the rule for the chart's names, 27 caught at once. Of the other seven, five had no test — one was written for each, and they are caught now; one pointed at a guard that could never fire, which was taken out; and one changes nothing that can be seen (the same name twice always moves together).
- [x] **…and a seventh time, 2026-10-13 — again nothing that stores, prints
  or plots a wrong value; two things about the phone chart's names, and
  what "every" had been said of.** (1) **A dose change could vanish from
  the names.** With the form brought back over a strength cut at its end
  (the sixth round's change), three bars — two strengths of one tablet, and
  one of them written another way, `Tab` for `Tablet.` — all read
  `10 mg+160 mg+…`: the labels differed, in how "Tablet" was written, and
  no label said 12.5 or 25. (2) **A tablet and an injection of one medicine
  and strength were still one name** when both came in two strengths longer
  than a line: the form over the cut strength was the name the other
  strength already had. In both, what was wrong is that a strength was cut
  without looking at the other strengths on the chart. Under a form that
  comes back, a strength is now compared part by part with the other
  strengths of the same medicine, and a part that differs is not the one
  left off (`10 mg…12.5 mg` beside `10 mg…25 mg`; `…500 mg` beside
  `…1000 mg`). (3) **The case the sixth round wrote down as a failing test
  is closed, and was wider than written**: two forms that begin alike
  (`Tablet (Delayed Release).` / `Tablet (Extended Release).`) were one
  name at any width where the brand was long enough, and the other pair
  read `Tablet` over `(Delayed Rel…`, with no medicine and no strength.
  Such a form now takes a line of its own, with the start of the brand and
  the strength under it. (4) **"A number is never shown in part" had two
  holes**: a number glued to a word (`Ciprofloxacin500mg` → `…50…`), and
  an amount too long to keep whole, which the rule did not look for at all
  — `1,200,000 IU` was cut to `1…`. A number is whole wherever it stands
  now; a too-long amount keeps its number and may lose its unit behind the
  mark; only a single number of twelve characters and more is cut where it
  stands. (5) **"Every" had been said of a sample.** The property "every
  pair on a chart of confusable medicines is told apart" draws a few
  thousand random charts a run. Counted instead, one chart in a hundred of
  one shape — a medicine in two forms and two strengths — was not four
  names, and had not been through two reviews. That shape and the three-bar
  one are now gone through whole over fixed pools (233,688 charts), and what
  is counted is what a doctor reads: two strengths of one medicine never
  show the same numbers. (6) The rule's pattern used `\p{…}` classes and
  `matchAll`, neither used anywhere else in the doctor app: a browser
  without the first (Firefox before 78) would not have shown a wrong name,
  it would have failed to load the page. Written without both; a test
  reads the file. (7) In the two-unit box, a lone space with a second-unit
  preference left over on a box that has ONE unit was dropped where it had
  always been recorded (unreachable with today's catalog; the box with one
  unit ignores the preference again). (8) **What the documents said that
  was not so**, corrected where it stood: "two cases are known", "both on
  the narrowest phones"; "an amount is never cut into", with no limit
  stated; "every label that came from a real sheet" (there is one);
  "nothing is left off" of a name whose form was (nothing after the turn
  is); and two tests named for more than they tried. Checked by breaking the code: 37 deliberate breaks in this round's changes to the name rule, 36 caught; the one that was not pointed at a way of cutting a strength that no case needed, and it was taken out.
- [x] **…and an eighth time, 2026-10-13 — nothing that stores, prints or
  plots a wrong value, and no label that states a false number; a dose
  change that could still not be read off the phone chart's names, a test
  that failed one run in four, and what the documents claimed.** These
  fixes FOLLOW the release the review was of: the product owner asked for
  the release that day (`2878301`, with the repository brought down to two
  branches, `main` and `dev`), and what the review found made a label say
  less than it could, never something false.
  (1) **A dose change was still hidden where the labels differed to begin
  with.** The seventh round's rule — a strength cut by the other strengths
  of its medicine — was applied only to names that had come out the SAME as
  another, and its count ran over four ways of writing a form, all of them
  words the app knows. With the third bar under a form it does not know by
  name, or under `Tablet` with no full stop (read as the start of the
  brand), the three labels differed, nothing was written again, and the
  first bar and the third both read `10 mg+160 mg+…` — 12.5 beside 25: 288
  of the 524,160 three-bar charts of the test's own ten forms, and of two
  bars under two forms 2,440 of 327,600. `namesApart` now ends with a pass
  over the strengths of ONE medicine: a name that was not written again is
  laid out once more with the other strengths of its medicine beside it,
  the strength has the second line to itself, cut by what it has to be
  told from, and the name keeps that unless it would put it under one name
  with another. Counted: 454,272 three-bar charts over thirteen ways of
  writing a form (the ten, `Tablet` and `Injection` with no stop, and
  none) and 340,704 two-bar ones; in none do two strengths show the same
  numbers. And what is kept of a strength is now what tells it from the
  MOST of the others: it was whatever showed the most of the parts that
  differ, and a THIRD strength on the chart that differed in every part
  made the cut at the end count for as much as the first part with the
  last — 12.5 and 25 read `10 mg+160 mg…` again. That was seen in a
  browser, on a made-up chart, before this was committed; the counts
  above all have two strengths of a medicine on a chart, and could not
  have seen it. Three strengths under mixed forms were gone through once
  by hand (1,223,040 charts; 158 left, open list); that count is not in
  the suite. (2) **A test that failed about one run in four, and the defect
  under it.** "Two names that are different are never written the same"
  draws 20,000 pairs a run, a different 20,000 each time. On 2026-10-13 a
  run failed. Drawn two million times it left 27 pairs alike — in the
  released code too, and none in the code before the seventh round's
  change, which is where it came in: that round was released on a run that
  passed. Nineteen were one defect: a word that begins inside an amount
  (`B12 pg/mL-fas…`, where `pg` reads as the unit of that 12) was shown
  from the amount, and the line ran out before the letter the names part
  at. Where the amount is too far back, it is shown from the place itself.
  The other eight are a limit, written down as a failing test (open list):
  two names whose only difference is in the UNIT of an amount too long to
  keep whole. After the fix: seven alike in two million, all of that
  shape, which the property now leaves out by name. (3) **Two more cases
  under one name, the same in the code before this release**, written down
  as failing tests (open list): a tablet and an injection of two medicines
  that differ at the END of a long brand, and the same with a strength in
  brackets. (4) **Two smaller things closed**: a strength behind a decimal
  point that is the label's FIRST full stop was not shown where the name
  was long (`Tab Clonazepam .5 mg` read `Tab` over `Clonazepam…`; now
  `Tab Clonazep…` over `.5 mg`), and the mark of a form left off stood
  straight before a name that begins with a point — four dots in a row.
  (5) **What the documents said that was not so**, corrected where it
  stood: "three ways" of writing a name again (four), with a calcium
  example that is no longer what is drawn, in the code's own comment;
  "(69,888)" for the three-bar count, with no word of its four forms and
  four brands; "one pair at thirteen letters" of the eight strengths
  (thirteen to sixteen as they are written, thirteen and fourteen with no
  space round the plus); "one such case is known" (four); "the part they
  differ in is the part kept", which held only for names that would have
  come out the same; `Mixtard 30/70 as before` as the example of a cut
  before a ratio (it fits whole; `Insulin Mixtard 30/70 as before` is the
  one that is cut); "a word that begins with a point begins the strength"
  (not where that point was the label's first full stop — closed above); a
  test named for more than it tried; and "a chart whose names are already
  different is not touched", which is no longer so and now says what is
  done. The seventh round's commit (`ba98264`) says of the one before it
  (`95c13a4`) that its message gave no limit for "an amount is never cut
  into" and wrote of a failing test "at thirteen letters": that message
  does state the limit, and those words are not in it. The commit is
  published and stays as written; this is the correction. Checked by breaking the code: 32 deliberate breaks in this round's changes, 28 caught at once; three had no test — one was written for each, and they are caught now; one pointed at a condition that was not needed, and it was taken out. And the seventh round's 37 were run again, because they were first run while a test under them failed one run in four, when any red run counts as a break caught: the 31 that still point at a line of today's code are all caught; the other six pointed at lines rewritten since, and the breaks made for those lines as they stand are caught too.
- [x] **…and a ninth, 2026-10-13, of the eighth round's fixes before they
  were released — it found the fix had cost something.** (1) **The
  strength's line was taken from the word that tells two MEDICINES
  apart.** Giving the strength the second line cuts the brand at its end;
  with `Exforge` on the same chart, `Tablet Exforg…` stood over a strength
  with nothing left to say it was the HCT, and `…Amlodipine +…` could be
  the Atenolol or the Olmesartan — where the release before had shown the
  word. The strings still differed, so nothing in the rule or its tests
  objected. The name now keeps the lines it has by itself wherever no more
  of its medicine's name would be left in sight than it shares with
  another medicine on the chart; counted over 126,000 charts of seven
  pairs of medicines that begin alike, where it is as the release before
  in every one, and tells two strengths apart in 2,028 where that did not.
  A label of the medicine with NO strength no longer counts as another
  strength to be told from, and the same medicine typed in another case
  is the same medicine. (2) **A limit, written down** (open list): a cut
  is told from the other strengths as they are written, not as their
  labels show them, so with three or more strengths two labels may each
  hide the part the other shows. (3) **The pass no longer depends on any
  order**: it was taken name by name in the order of the names, which no
  test held (a break of it went unseen); every name is now asked the same
  question of the same settled chart. (4) **Three things the samples gave
  up once they were drawn far enough**, each in the release too and each
  closed: the fix for a word that begins inside an amount measured the
  line only as far as the place two names part at, not to the end of the
  amount the place may itself be in (`Serum B12 pg/mL-A1 % of total` /
  `…A2…` were one name at fourteen letters); a full stop after a unit
  (`mg.25 ml`) was read as a decimal point once a mark stood before it —
  a quarter of what was written; and a short piece of a line (`25`) was
  found first INSIDE the hidden number before it (`12125 mg`), so that
  what was brought into view stopped there, `121`. The last two were seen
  only in lines of eight and ten letters, narrower than any chart. After
  them: six million labels and three million pairs drawn at random, none
  with a number in part, none alike outside the one shape that is written
  down. (5) The mark of a form left off still stood straight before a
  point on ONE of two paths (`….5 Rivotril`); closed on both. (6) **What
  the eighth round's record said that was not so**: "seven alike in two
  million, all of that shape" was one draw — the review's own found two
  pairs outside it; "one run in four" was 27 pairs in one draw, 12 in
  another, and 14 failing runs in a hundred; the known case of a long
  amount's unit is not only "in thirteen letters" (a longer amount, a
  wider line); "with no other strength on the chart a label may show no
  strength" — also with one, where the guard above refuses the line; and
  the fix's title, "wherever it stands", says more than is done: a form
  of two words with no full stop is still not matched. The commits are
  published and stay; this is the correction. Checked by breaking the code: 13 deliberate breaks in this round's changes. Nine were caught at once by a named example; two only by the sampled pair property, and an example is written for them now; one had no test and has one. One is not caught: the refusal of a strength's line that is another name's lines as they already STAND — no chart was found where that happens, and the check is kept so that this pass can never put two names under one.
- [x] **…and a tenth, 2026-10-13, of the ninth round's fix (`58a7fa5`) —
  the guard had holes, and a rule replaced it.** That fix let the strength
  take the second line unless no more of the medicine's name would be left
  than it "shares with another medicine on the chart". (1) **It could not
  fire for the SHORTER of two names**: with `Exforge HCT` on the chart, a
  plain `Tablet Exforge 5 mg+160 mg+12.5 mg` read `Tablet Exfor…` over its
  strength, where the release before said `Exforge` whole. (2) **Refusing
  one name the line gave the same lines to its sibling.** (3) **Nothing
  set a floor**: behind a form the app cannot set aside, `Oral Solution
  Diovan …` read `Oral Solutio…` — no medicine at all. And the commit's own
  sentence, "against the release … the medicine is as readable in every
  one", was false: measured by the review, 8,944 of 378,000 labels showed
  fewer letters of their medicine than the release, and 570 no longer
  ruled out the other medicine. Three rules for "what may be lost" had now
  had a hole each, so the rule that replaced them has no judgement in it:
  **a name keeps the lines it has by itself unless the new ones show as
  much of its medicine's name, from its start, as those did**; and a form
  word typed with no full stop gives way where there is no room for it, so
  that the brand need not. Counted in the suite over 252,000 charts of two
  medicines that begin alike, each in turn in two strengths; and against
  the release, over 493,920 such charts (seven ways of writing a form,
  two of them with no full stop): not one label of 1,481,760 shows less of
  its medicine's name, 99,957 show more, two strengths of one medicine
  show different numbers in 5,918 charts where they did not, and never the
  reverse. **What the rule gives up** (open list): for a brand longer than
  a line the strength is not given the line, and a dose change stays as
  unreadable as in the release in about one two-bar chart in a hundred of
  such a brand — so the two counts of the eighth round are now over brands
  that FIT a line, and say so. (4) Also seen, not changed: a full stop
  after a unit, before a digit (`mg.25 ml`), behind a mark is now `…25 ml`
  where the release wrote `… .25 ml` — the reading the rule's own scan of
  the name gives, and a guess about a typed full stop all the same;
  reachable only where a first word longer than the line ends in a number.
  And a made-up name can still leave a first line that is a mark and
  nothing else. (5) Two ways of writing ONE medicine and strength
  (`Tablet.` picked, `Tablet` typed) are offered the very same lines; one
  of them has them — the first by its own name, whatever the order of the
  list — and the other keeps its own. Refused to both, neither bar showed
  the part that differs from the other strengths (seen in a browser, on a
  made-up chart). This round's rule was not reviewed by another reader: it
  was checked by counting it against the release, as above, by two
  million pairs drawn at random (no number in part, none alike outside the
  one shape written down), and by breaking it — 12 deliberate breaks, 11
  caught by a named example, one that changes nothing that can be seen.

- [ ] **A number typed with a comma is not plotted on the health-trend chart
  (`DEFECT-HM-GROUPED`, found 2026-10-12 — the physician's call).** A
  result's boxes are stored joined by commas, so `WBC:12,000cells/uL` and
  `PLT:1,50,000/cmm` cannot be told from two parts and give NO point: the
  lane reads as if nothing had been recorded, while the record and the
  print are right. Plotting `12,000` as twelve thousand is the obvious
  reading, but it is a reading of what the doctor typed — decide it, and
  whether a comma can ever be a decimal comma here, and it is a small
  change in `client/src/lib/numericInvSeries.ts` with its test waiting
  (`it.fails`). The same blind spot shows a typed `12,000` as `12, 000` in
  the Investigation popup's "Added results" for a test with several boxes
  (`DEFECT-INV-GROUPED`). Both go away if a result's parts are stored
  apart. **And a number typed with a comma AND a space inside it is still
  drawn as a piece of itself (`DEFECT-HM-SPACED`, found in the sixth
  review; production draws the same):** `WBC:1, 200/cmm` as 1, in a box
  that writes its name and has no unit; `> 2, 000` as 0, `approx 1, 200`
  as 200 and a decimal typed `,5` as 5, in a box stored with no name. The
  chart takes a comma followed by a space for punctuation — right for
  `350, 80% lymphocytes` and `2.5, 3 days after dose change`, which keep
  their point — and nothing in the string tells that from a number typed
  with a space in it. It is the same question: what a typed comma means.

- [ ] **Found in the fourth and fifth reviews and left open (2026-10-12).** (1) **The
  health-trend chart reads no number with a sign — the physician's call.**
  A DEXA T-score of `-2.5` gives no point, and its lane says there is no
  reading; T-score and Z-score are the two boxes in the catalog whose usual
  value is negative. A test has always pinned that a value beginning with a
  minus is dropped (`numericInvSeries.test.ts`), so reading it is a
  decision, not a slip. (2) On the chart an ETT's METs is not drawn when its
  report begins with a number (`METs:10,150 bpm at peak`): the report box
  writes no name of its own, so nothing in the stored value says whether
  that is METs 10 and a report or a METs of 10,150. A report that begins
  with a word keeps the point. (3) An open personal note stays on its own patient when
  another device moves the editor on, and nothing in the box SAYS the
  editor has moved; the patient's details shown in the box are its own.
  (4) The first save of a personal note takes the patient's details as the
  header showed them when the note was OPENED, no longer as it shows them at
  the moment of saving — on one device they cannot differ (the box covers
  the header); they can if another device edits the header in between.
  (5) On a WIDE screen the chart's names are still one line cut at 20
  characters, and the lay-out-together rule is not applied there: two names
  alike in their first 19 letters are one name on a desktop, as they are in
  production. (6) **Words typed into a personal note and not yet saved are
  lost when another device clears the editor or changes tab** (device
  mirroring: New Prescription, that device's own Save & print, or a move to
  OPD). This device's editor is redrawn (`PatientGate`, the tab router) and
  the open note closes with it, without a question. As in production; seen
  while writing the two-browser test. Keeping the note through it means
  holding the note above the editor — a change of its own. (7) **A second
  sign-in of the same doctor empties the draft the first device is working
  in** (`MuqsitContext`: a fresh sign-in starts blank AND clears the stored
  draft). The first device writes it again at its next edit; if it is
  reloaded before that, the visit comes back empty. And on the dev server
  the second sign-in sometimes opens with the first device's patient
  instead of blank — the editor's start-up runs twice under React's
  development checks and the second run no longer sees "just signed in";
  whether a production build can do the same was not checked.
  (8) **`DEFECT-HM-NAMES` — on a phone's chart, names that differ in more
  places than two short lines can show.** Each is still written differently
  where a way is left, but a name may then not say every difference (of
  five strengths of one tablet, two pairs no longer say whether their
  middle part is 5 or 10), and four cases are known where two bars are left
  under ONE name — each an `it.fails` in `timelineLabel.test.ts`, with what
  is drawn today beside it: (a) eight strengths of one tablet, in one form,
  differing in three places — one pair, in a line of thirteen to sixteen
  letters as they are written with a space round the plus, of thirteen and
  fourteen with none; (b) a tablet and an injection of two medicines whose
  names differ only at the END of a long brand, with no strength
  (`Vitamin B Complex Forte` / `Plus`, made-up names) — the two forms of
  one of them, up to seventeen letters; (c) the same with a strength
  written in brackets (`(400 mg+400 mg+30 mg)/5 ml`), which is not read as
  a strength — up to eighteen; (d) two names whose only difference is in
  the UNIT of an amount too long to keep whole (`1,00,000 CFU` /
  `1,00,000 RBC`, in thirteen letters). (One more, written down in the
  sixth review — two forms that begin alike — was closed in the seventh.)
  What is COUNTED is one medicine in two forms and two strengths (163,800
  charts), two strengths with one written another way (454,272) and two
  strengths under two forms (340,704) — both for brands that FIT a line —
  and two medicines that begin alike, where no name may show less of its
  medicine than it shows by itself (252,000), over fixed pools; every
  other shape is covered by samples — random charts, and 20,000 random
  pairs a run — and a sample has been wrong here three times. For a brand
  LONGER than a line (`Amlodipine + Olmesartan` written out) the strength
  is not given the second line, because the name would pay for it, and a
  dose change may read the same on two bars: 1,203 of 113,568 two-bar
  charts of that brand under two forms (1,683 in the release before), 41
  of 227,136 three-bar ones (41 before) — gone through once, not in the
  suite. With THREE
  strengths of one medicine under two or three ways of writing a form, 158
  of 1,223,040 charts still show the same numbers for two of them, in
  thirteen and fourteen letters: a `12.5` or a `25` that is the first part
  of one strength (`12.5 mg+…`) and the last of another (`…12.5 mg`).
  (Gone through once, not in the suite: every three of the fourteen
  strengths, under every three of six ways of writing a form that are not
  all the same, two brands, widths 13 to 20; another pool gives another
  figure.) And what a cut is told from is the other strengths as they are
  WRITTEN, not as their labels show them: with three or more strengths
  that differ in several places, two labels may each hide the part the
  other shows (`40 mg…12.5 mg` beside `40 mg+10 mg+…`, which both fit a
  40 mg+10 mg+12.5 mg) — the ninth review counted pairs made unsure this
  way that the release before had told apart, some thousands in pools
  built for it, next to none where every label is picked from the list.
  Known besides: a label may show NO strength where a long brand and a
  long strength both have to give way (`…Salmeterol +` over
  `Fluticasone…`) or where the strength is written in brackets, which the
  split does not read as a strength — always possible with no other
  strength of its medicine on the chart, and still possible with one,
  where giving the strength the line would put two names under one or hide
  which medicine it is; the same medicine is matched whatever its case and
  with or without a ONE-word form before it, not under a form of two words
  written with no full stop (below); under a form
  on a line of its own, what follows the brand's mark may be only the LAST
  part of a strength (`Jardim…500 mg` for 12.5 mg+500 mg) — the one mark
  stands for the rest of the brand and the start of the strength both, and
  a reader may take the part for the whole; a name told
  apart from the place it differs in may not show its brand; a dosage form
  written with NO full stop after it (`Oral Solution Avolac 3.35 gm/5 ml` —
  five of the eight labels of the one sheet in the tests are written so) is
  read as part of the name, so on a phone it is the brand that is cut
  (`Oral Solutio…` over `3.35 gm/5 ml`), where the labels picked from the
  medicines list, which have the stop, are laid out with the brand whole —
  whether stored labels are written without it was not checked; what a
  unit is, is a guess — the short word after a number — so `30/70 as` is
  kept together and `Insulin Mixtard 30/70 as before` is cut before its
  30/70 (`Insulin` over `Mixtard…`, in thirteen and fourteen letters) on a
  line where the number alone would have fitted; and a cut can still fall
  inside a Bangla conjunct, as it can in production. The tooltip and the
  list under the chart carry every name in full; a third line, a wider
  strip, or laying a name out round EVERY place it differs in would close
  most of it, and each changes the look of the chart. (9) A personal note's save that FAILS after
  the note was closed says nothing (Close with "Discard" while the request
  was still on its way): the words are gone and no message is shown. As in
  production. (10) In the client suite's log, two older test files
  print React's "not configured to support act(...)" warning
  (`PatientChat.test.tsx`, `PatientMobileLookup.test.tsx`); they pass, and
  were not looked into. (11) **`DEFECT-D4` — the cleaner of the personal
  note's and the header's HTML does not give the same HTML on a second
  cleaning, for three shapes** (`safeHtml.prop.test.ts`, four `it.fails`): a
  block inside a pasted table or a button inside a paragraph, and — found
  2026-10-12 — a heading left directly inside a heading when the tag
  between them is taken away (`<h1>a<a><h1>b</h1></a>c</h1>`), and — found
  18/10/2026 in a release review, the property failing once — a list item
  left inside a list item (`<li>a<form><li>b</li></form>c</li>`). The
  property now sets aside every tree HTML cannot write, by the parser's own
  rules, instead of one pattern per shape. Layout only:
  no word is lost and nothing unsafe comes out; the second cleaning is
  stable. Cleaning until nothing changes would close it; it is a change to
  the sanitiser and was not made in a release it did not belong to.
  (12) **A result box that holds only a space is recorded as a result**
  with its unit and no value (`S. Creatinine: mg/dL`), and prints — in the
  preferred box of a two-unit pair and in every box with one unit. As in
  production (the sixth review closed it only for the box this release had
  newly opened it in). One `trim()` where a test's boxes are gathered
  closes it for all. (13) **The Investigation popup's boxes are not emptied
  when the editor is** (`resetEditor` leaves `invFormData`): in production,
  a value typed in the second box of a two-unit pair and not recorded
  stayed in that box for the next patient. Since this release a value typed
  in either box of a pair is filed when the popup closes or its date
  changes, and the boxes of a test that was filed are emptied, so it no
  longer comes about on one device (a lone space, which is not filed, stays
  in its box); a device still on the older build can mirror such a state in.
  Emptying the converted box of a two-unit pair empties the one that was
  typed in, as it always has — visible, and nothing is then recorded. And
  Enter in the SECOND unit's box of a pair files nothing, as in production:
  the value is filed when the popup closes.

### Drug history table, Edit and Add on the records page (07/11/2026) - open for the physician

- [ ] **Two courses of one medicine are two rows here, but ONE bar on the Health-trend chart**, from the first start to the last end — the gap between them drawn as taken. Not changed: one bar per course would change how the chart's duration overrides (keyed by the medicine's name) work. Every other bar now also runs to the End of its course where its duration can be read — **this changes the bars of patients already on record** (a 7-day course used to be a point on its date).
