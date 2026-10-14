import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { catalogueRowsByBrandWord } from './catalogue';

/** A catalogue row as the monthly-cost box reads it: the medicine, and its price as the chart writes it. */
export interface PricedRow {
  brandName: string;
  dosageForm: string | null;
  strength: string | null;
  priceRaw: string | null;
}

// Row shape returned from the raw `medicines` query.
export interface MedicineHit {
  id: string;
  brandName: string;
  genericName: string | null;
  dosageForm: string | null;
  strength: string | null;
  company: string | null;
  priceRaw: string | null;
}

@Injectable()
export class MedicinesService {
  constructor(private readonly prisma: PrismaService) {}

  // Search by trade (brand) name first, then generic. Ranking, best → worst:
  //   0  brand starts with the query   (na → Napa)
  //   1  brand contains the query      (…na…)
  //   2  generic starts with the query (na → Naproxen → Aktivex)
  //   3  generic contains the query
  // So brand-name matches always surface above generic-name matches.
  // Patterns are bound parameters (no SQL injection).
  async search(query: string): Promise<MedicineHit[]> {
    const q = (query ?? '').trim();
    if (q.length < 2) return [];

    const prefix = `${q}%`;
    const contains = `%${q}%`;

    return this.prisma.$queryRaw<MedicineHit[]>`
      SELECT id, "brandName", "genericName", "dosageForm", strength, company, "priceRaw"
      FROM medicines
      WHERE "brandName" ILIKE ${contains} OR "genericName" ILIKE ${contains}
      ORDER BY
        -- 1) relevance: brand prefix > brand contains > generic
        CASE
          WHEN "brandName" ILIKE ${prefix} THEN 0
          WHEN "brandName" ILIKE ${contains} THEN 1
          WHEN "genericName" ILIKE ${prefix} THEN 2
          ELSE 3
        END,
        -- 2) dosage form: capsule > tablet > syrup > suppository > other
        CASE
          WHEN "dosageForm" ILIKE 'cap%' THEN 0
          WHEN "dosageForm" ILIKE 'tab%' THEN 1
          WHEN "dosageForm" ILIKE 'syp%' OR "dosageForm" ILIKE 'syr%' THEN 2
          WHEN "dosageForm" ILIKE 'supp%' THEN 3
          ELSE 4
        END,
        "brandName",
        "strength"
      LIMIT 10
    `;
  }

  /**
   * The chart's rows for the brands on a ℞ pad, by the first word of each brand
   * — the candidates the "Total monthly approximate cost" box prices from.
   * Which row IS a line's medicine (form and strength included: Sergel 20 mg is
   * not Sergel 40 mg) is decided on the client, by the comparison the pad uses
   * everywhere (`client/src/lib/medicineKey.ts#sameMedicine`); this only fetches,
   * by the same equality the generic lookup uses (`catalogue.ts`). The price is
   * given as the chart writes it (`priceRaw`) and read on the client, where only
   * a price it can read whole is used.
   *
   * THROWS when the chart cannot be asked: "the prices could not be loaded" must
   * not look like "this medicine has no price".
   */
  async byBrand(words: string[]): Promise<{ rows: PricedRow[] }> {
    const asked = [...new Set((words ?? []).map((w) => String(w ?? '').trim().toLowerCase()).filter(Boolean))];
    if (asked.length === 0) return { rows: [] };
    const rows = await catalogueRowsByBrandWord(this.prisma, asked);
    return {
      rows: rows.map((r) => ({ brandName: r.brandName, dosageForm: r.dosageForm, strength: r.strength, priceRaw: r.priceRaw })),
    };
  }
}
