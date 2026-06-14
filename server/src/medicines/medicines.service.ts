import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Row shape returned from the raw `medicines` query.
export interface MedicineHit {
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

  // Search brand/generic name. Prefix matches ("napa%") rank above contains
  // matches ("%napa%"). Patterns are passed as bound parameters (no injection).
  async search(query: string): Promise<MedicineHit[]> {
    const q = (query ?? '').trim();
    if (q.length < 2) return [];

    const prefix = `${q}%`;
    const contains = `%${q}%`;

    return this.prisma.$queryRaw<MedicineHit[]>`
      SELECT "brandName", "genericName", "dosageForm", strength, company, "priceRaw"
      FROM medicines
      WHERE "brandName" ILIKE ${contains} OR "genericName" ILIKE ${contains}
      ORDER BY
        CASE WHEN "brandName" ILIKE ${prefix} OR "genericName" ILIKE ${prefix} THEN 0 ELSE 1 END,
        "brandName"
      LIMIT 10
    `;
  }
}
