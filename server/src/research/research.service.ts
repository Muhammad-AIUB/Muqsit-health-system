import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ResearchHit {
  id: string;
  name: string;
  age: number | null;
  sex: string | null;
  mobile: string | null;
  tags: string[];
  diseases: string[];
}

@Injectable()
export class ResearchService {
  constructor(private readonly prisma: PrismaService) {}

  // Find this doctor's patients whose tags or diagnoses match the query.
  // Diseases come from each patient's prescription diagnoses.
  async search(doctorId: string, q: string): Promise<ResearchHit[]> {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];

    const patients = await this.prisma.patient.findMany({
      where: { doctorId },
      select: {
        id: true,
        name: true,
        age: true,
        sex: true,
        mobile: true,
        tags: true,
        prescriptions: {
          select: { finalDiagnosis: true, provisionalDiagnosis: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return patients
      .map((p) => {
        const diseases = [
          ...new Set(
            p.prescriptions.flatMap((rx) => [
              ...rx.finalDiagnosis,
              ...rx.provisionalDiagnosis,
            ]),
          ),
        ];
        return { id: p.id, name: p.name, age: p.age, sex: p.sex, mobile: p.mobile, tags: p.tags, diseases };
      })
      .filter(
        (p) =>
          p.tags.some((t) => t.toLowerCase().includes(needle)) ||
          p.diseases.some((d) => d.toLowerCase().includes(needle)),
      );
  }
}
