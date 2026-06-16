import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrescriptionTemplate } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto';

// Prescription templates are private to each doctor — every query is scoped to
// the signed-in doctor's id.
@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  list(doctorId: string, category?: string): Promise<PrescriptionTemplate[]> {
    return this.prisma.prescriptionTemplate.findMany({
      where: { doctorId, ...(category ? { category } : {}) },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  create(doctorId: string, dto: CreateTemplateDto): Promise<PrescriptionTemplate> {
    return this.prisma.prescriptionTemplate.create({
      data: {
        doctorId,
        category: dto.category,
        name: dto.name,
        items: dto.items as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async update(doctorId: string, id: string, dto: UpdateTemplateDto): Promise<PrescriptionTemplate> {
    await this.owned(doctorId, id);
    return this.prisma.prescriptionTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.items !== undefined ? { items: dto.items as unknown as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async remove(doctorId: string, id: string): Promise<{ id: string }> {
    await this.owned(doctorId, id);
    await this.prisma.prescriptionTemplate.delete({ where: { id } });
    return { id };
  }

  private async owned(doctorId: string, id: string): Promise<void> {
    const row = await this.prisma.prescriptionTemplate.findFirst({ where: { id, doctorId } });
    if (!row) throw new NotFoundException('Template not found');
  }
}
