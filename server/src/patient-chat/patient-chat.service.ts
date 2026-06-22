import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SendChatDto } from './dto/chat.dto';

@Injectable()
export class PatientChatService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Access control ────────────────────────────────────────────────────────
  // A user may read/post in a patient's chat if they are the owner doctor or an
  // assistant working in the owner's workstation (effectiveDoctorId resolves to
  // the patient's doctor in both cases), or an assigned supervising doctor.
  private async assertAccess(
    patientId: string,
    userId: string,
    effectiveDoctorId: string,
  ): Promise<{ doctorId: string | null }> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, doctorId: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    if (patient.doctorId && patient.doctorId === effectiveDoctorId) return patient;

    const supervises = await this.prisma.patientSupervisor.findFirst({
      where: { patientId, doctorId: userId },
      select: { id: true },
    });
    if (supervises) return patient;

    throw new ForbiddenException('You do not have access to this patient.');
  }

  // Only the true owner doctor manages the supervisor list.
  private async assertOwner(patientId: string, userId: string): Promise<void> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { doctorId: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    if (patient.doctorId !== userId)
      throw new ForbiddenException('Only the owning doctor can manage supervisors.');
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  async listMessages(patientId: string, userId: string, effectiveDoctorId: string) {
    await this.assertAccess(patientId, userId, effectiveDoctorId);
    const rows = await this.prisma.patientChatMessage.findMany({
      where: { patientId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return rows.map((m) => ({ ...m, mine: m.authorId === userId }));
  }

  async sendMessage(
    patientId: string,
    userId: string,
    authorName: string,
    effectiveDoctorId: string,
    dto: SendChatDto,
  ) {
    await this.assertAccess(patientId, userId, effectiveDoctorId);
    const body = (dto.body ?? '').trim();
    if (!body && !dto.attachmentUrl)
      throw new BadRequestException('Message is empty.');
    return this.prisma.patientChatMessage.create({
      data: {
        patientId,
        authorId: userId,
        authorName: authorName || 'Someone',
        body,
        attachmentUrl: dto.attachmentUrl || null,
      },
    });
  }

  // ── Supervising doctors ───────────────────────────────────────────────────
  async listSupervisors(patientId: string, userId: string, effectiveDoctorId: string) {
    await this.assertAccess(patientId, userId, effectiveDoctorId);
    const rows = await this.prisma.patientSupervisor.findMany({
      where: { patientId },
      orderBy: { createdAt: 'asc' },
      select: {
        doctorId: true,
        createdAt: true,
        doctor: { select: { name: true, displayName: true, email: true } },
      },
    });
    return rows.map((r) => ({
      doctorId: r.doctorId,
      name: r.doctor.displayName?.trim() || r.doctor.name,
      email: r.doctor.email,
      createdAt: r.createdAt,
    }));
  }

  async addSupervisor(patientId: string, ownerId: string, identifier: string) {
    await this.assertOwner(patientId, ownerId);
    const id = identifier.trim();
    if (!id) throw new BadRequestException('Enter an email or mobile number.');

    const doctor = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: id, mode: 'insensitive' } },
          { mobile: id },
        ],
        role: 'professional',
        deletedAt: null,
      },
      select: { id: true, name: true, displayName: true, email: true },
    });
    if (!doctor)
      throw new BadRequestException('No registered doctor found with that email or mobile.');
    if (doctor.id === ownerId)
      throw new BadRequestException('You already own this patient.');

    await this.prisma.patientSupervisor.upsert({
      where: { patientId_doctorId: { patientId, doctorId: doctor.id } },
      create: { patientId, doctorId: doctor.id },
      update: {},
    });
    return {
      doctorId: doctor.id,
      name: doctor.displayName?.trim() || doctor.name,
      email: doctor.email,
    };
  }

  async removeSupervisor(patientId: string, ownerId: string, doctorId: string) {
    await this.assertOwner(patientId, ownerId);
    await this.prisma.patientSupervisor.deleteMany({ where: { patientId, doctorId } });
    return { doctorId };
  }

  // Patients the given user has been assigned to supervise (for their
  // "Supervised patients" view). Cross-doctor by design.
  async listSupervisedPatients(userId: string) {
    const rows = await this.prisma.patientSupervisor.findMany({
      where: { doctorId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        patient: {
          select: {
            id: true, name: true, age: true, ageAsOfYear: true, dob: true,
            sex: true, mobile: true, hospitalId: true,
            doctor: { select: { name: true, displayName: true } },
          },
        },
      },
    });
    return rows
      .filter((r) => r.patient)
      .map((r) => ({
        ...r.patient,
        ownerName: r.patient!.doctor?.displayName?.trim() || r.patient!.doctor?.name || '',
      }));
  }
}
