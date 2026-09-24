import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

// In-process memo of recent searches. Every keystroke in the ℞ pad is a query,
// and `ILIKE '%q%'` over 20k rows is the most repeated query in the app. Keyed
// by the lower-cased query; bounded; entries expire so a manual SQL correction
// to the formulary is visible within CACHE_TTL_MS (or on the next pm2 restart).
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 2000;

@Injectable()
export class MedicinesService {
  private readonly cache = new Map<string, { at: number; hits: MedicineHit[] }>();

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

    const cacheKey = q.toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.hits;

    const hits = await this.query(q);
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      // Map iterates in insertion order → drop the oldest entry.
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(cacheKey, { at: Date.now(), hits });
    return hits;
  }

  private query(q: string): Promise<MedicineHit[]> {
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
}
