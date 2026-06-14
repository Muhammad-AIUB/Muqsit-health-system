import { Injectable } from '@nestjs/common';
import { PrescriptionLayout } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertPrescriptionLayoutDto } from './dto/prescription-layout.dto';

// The defaults a doctor sees before they've saved anything. Mirrors the
// initial values in the client's Prescription settings form.
const DEFAULTS = {
  unit: 'in',
  totalHeight: '11',
  totalWidth: '8.25',
  leftMargin: '0.3',
  rightMargin: '0.2',
  headerHeight: '1.7',
  footerHeight: '0.8',
  headerSplit: false,
  headerAlign: 'left',
  headerHtml: '',
  headerLeftHtml: '',
  headerRightHtml: '',
  footerHtml: '',
  bodySplit: '',
  bodyLeftTopMargin: '0',
  bodyRightTopMargin: '0',
  bodyBottomLine: false,
};

@Injectable()
export class PrescriptionLayoutService {
  constructor(private readonly prisma: PrismaService) {}

  // Return the saved layout, or the defaults if the doctor hasn't saved one.
  async get(userId: string): Promise<PrescriptionLayout | (typeof DEFAULTS & { userId: string })> {
    const row = await this.prisma.prescriptionLayout.findUnique({ where: { userId } });
    return row ?? { ...DEFAULTS, userId };
  }

  // Create on first save, update thereafter — scoped to the signed-in doctor.
  upsert(userId: string, dto: UpsertPrescriptionLayoutDto): Promise<PrescriptionLayout> {
    return this.prisma.prescriptionLayout.upsert({
      where: { userId },
      create: { ...DEFAULTS, ...dto, userId },
      update: { ...dto },
    });
  }
}
