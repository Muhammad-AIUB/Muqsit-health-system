import type { PrismaService } from '../prisma/prisma.service';

/** One row of the raw `medicines` catalogue, as the lookups by brand read it. */
export interface CatalogueRow {
  brandName: string;
  genericName: string | null;
  dosageForm: string | null;
  strength: string | null;
  priceRaw: string | null;
}

/**
 * Every catalogue row whose brand begins with one of these words — in ONE
 * pass over the table, however many words there are. The words are expected
 * in lower case. Two callers: the generic of "Your usual" and the "Add Bulk
 * Medicine" list (`rx-habits.service.ts#attachGenerics`), and the prices of
 * the "Total monthly approximate cost" box (`medicines.service.ts#byBrand`).
 *
 * ⚕️ An EQUALITY on the brand's first word, joined against the list of words.
 * It was a pattern per brand (`"brandName" ILIKE ANY('{napa%,…}')`), which is
 * fine for the dropdown's four medicines and ruinous for a doctor's whole
 * list: every pattern is tried against every row. Measured on 2026-10-14 on a
 * made-up catalogue of 35,000 medicines, that cost 0.8 s per 25 brands — 5 to
 * 7 s to open the box with 200 medicines, over a minute with 2,000. As one
 * hash join the query is 0.05 s for 200 and 0.13 s for 2,000 (the whole
 * service call 0.08 s and 0.32 s), and for the dropdown
 * it is cheaper than the pattern was.
 *
 * It also asks a better question. A prefix needed a row cap, and a cap that
 * bites drops whichever brands the database reached last — silently, at the
 * cost of a contraindication warning. A word of one letter could not be
 * asked for at all (`e%` is every brand beginning with E). An equality needs
 * neither rule: it returns the brands whose first word IS the word, and the
 * answer is bounded by the catalogue — a table of medicines, not of patients.
 * Do not turn it back into a `LIKE`, and do not use `= ANY($1)` for the list:
 * with a bound array that is a linear search per row (2.5 s for 2,000 brands,
 * measured).
 *
 * The first word is taken the way `normaliseDrugKey` would take it: lower
 * case, leading space ignored, and a tab, a line break or a no-break space
 * counted as the space a spreadsheet meant.
 *
 * `medicines` is a raw table, not a Prisma model (see server/CLAUDE.md). The
 * words are a BOUND parameter, so the doctor's own text can never reach the
 * SQL — and being compared, not matched, a `%` or `_` in one means only
 * itself. The rows come in a stated order (brand, form, strength, generic),
 * so the same medicine is read the same way on every request.
 */
export function catalogueRowsByBrandWord(prisma: PrismaService, words: string[]): Promise<CatalogueRow[]> {
  return prisma.$queryRawUnsafe<CatalogueRow[]>(
    `SELECT "brandName", "genericName", "dosageForm", strength, "priceRaw"
     FROM medicines
     WHERE lower(split_part(btrim(translate("brandName", E'\\t\\n\\r' || chr(160), '    ')), ' ', 1))
           IN (SELECT unnest($1::text[]))
     ORDER BY "brandName", "dosageForm", strength, "genericName"`,
    words,
  );
}
