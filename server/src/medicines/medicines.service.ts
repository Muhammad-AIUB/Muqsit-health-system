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
        CASE
          WHEN "brandName" ILIKE ${prefix} THEN 0
          WHEN "brandName" ILIKE ${contains} THEN 1
          WHEN "genericName" ILIKE ${prefix} THEN 2
          ELSE 3
        END,
        "brandName"
      LIMIT 10
    `;
  }
}
