import { Injectable, NotFoundException } from '@nestjs/common';
import { Patient, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePatientDto,
  LinkPatientDto,
  UpdatePatientDto,
} from './dto/patient.dto';

// One entry of a patient's family tree (stored as JSON on Patient.familyMembers).
type FamilyMember = {
  name: string;
  mobile: string;
  nid: string;
  sex: string;
  relation: string;
  // Set when the relative is itself a saved patient — lets the UI jump to them.
  patientId?: string;
};

const isMale = (sex?: string | null) => (sex ?? '').trim().toLowerCase().startsWith('m');

// Given the NEW patient X's role relative to existing patient T (X is T's
// `relation`), return what T is in X's family tree — resolved by T's gender.
// son/daughter ⇒ T is X's parent; father/mother ⇒ T is X's child;
// brother/sister ⇒ T is X's sibling; spouse ⇒ spouse.
function inverseRelation(relation: string, tIsMale: boolean): string {
  switch (relation.trim().toLowerCase()) {
    case 'son':
    case 'daughter':
      return tIsMale ? 'Father' : 'Mother';
    case 'father':
    case 'mother':
      return tIsMale ? 'Son' : 'Daughter';
    case 'brother':
    case 'sister':
      return tIsMale ? 'Brother' : 'Sister';
    case 'spouse':
      return 'Spouse';
    default:
      return 'Spouse';
  }
}

// Normalise an incoming relation to the UI's capitalised vocabulary.
function canonRelation(relation: string): string {
  const r = relation.trim().toLowerCase();
  const map: Record<string, string> = {
    son: 'Son', daughter: 'Daughter', spouse: 'Spouse', father: 'Father',
    mother: 'Mother', brother: 'Brother', sister: 'Sister',
  };
  return map[r] ?? 'Spouse';
}

// Best-effort sex for the NEW patient when not supplied — inferred from the
// relation (son⇒Male, daughter⇒Female …); spouse ⇒ opposite of T's sex.
function inferSex(relation: string, tIsMale: boolean): string {
  switch (relation.trim().toLowerCase()) {
    case 'son':
    case 'father':
    case 'brother':
      return 'Male';
    case 'daughter':
    case 'mother':
    case 'sister':
      return 'Female';
    case 'spouse':
      return tIsMale ? 'Female' : 'Male';
    default:
      return '';
  }
}

// Every query is scoped to the signed-in doctor — one doctor can never
// see or touch another doctor's patients.
@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  list(doctorId: string, search?: string): Promise<Patient[]> {
    const where: Prisma.PatientWhereInput = { doctorId };
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { mobile: { contains: q } },
        { nid: { contains: q } },
      ];
    }
    return this.prisma.patient.findMany({ where, orderBy: { updatedAt: 'desc' } });
  }

  listWatched(doctorId: string): Promise<Patient[]> {
    return this.prisma.patient.findMany({
      where: { doctorId, watched: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(doctorId: string, id: string): Promise<Patient> {
    const patient = await this.prisma.patient.findFirst({ where: { id, doctorId } });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  // Every patient sharing a phone number, newest first. Powers the prescription
  // mobile-lookup dropdown (one number can map to several family members).
  findByMobile(doctorId: string, mobile: string): Promise<Patient[]> {
    const m = mobile.trim();
    if (!m) return Promise.resolve([]);
    return this.prisma.patient.findMany({
      where: { doctorId, mobile: m },
      orderBy: { updatedAt: 'desc' },
    });
  }

  // Family-tree members (across the doctor's patients) whose number matches —
  // shown as info-only rows in the mobile lookup ("this number is X's father").
  async relativesByMobile(
    doctorId: string,
    mobile: string,
  ): Promise<Array<{ patientId: string; patientName: string; name: string; relation: string; sex: string; mobile: string }>> {
    const m = mobile.trim();
    if (!m) return [];
    const rows = await this.prisma.$queryRaw<
      Array<{ patientId: string; patientName: string; member: Record<string, unknown> }>
    >`
      SELECT p."id" AS "patientId", p."name" AS "patientName", fm.value AS member
      FROM "Patient" p, jsonb_array_elements(p."familyMembers") fm
      WHERE p."doctorId" = ${doctorId}
        AND jsonb_typeof(p."familyMembers") = 'array'
        AND fm.value->>'mobile' = ${m}
      LIMIT 20
    `;
    return rows.map((r) => ({
      patientId: r.patientId,
      patientName: r.patientName,
      name: String(r.member?.name ?? ''),
      relation: String(r.member?.relation ?? ''),
      sex: String(r.member?.sex ?? ''),
      mobile: String(r.member?.mobile ?? ''),
    }));
  }

  create(doctorId: string, dto: CreatePatientDto): Promise<Patient> {
    const { dob, ...rest } = dto;
    // Loose cast: `ageAsOfYear` may not be in the generated client yet (the DB
    // column exists, so Postgres accepts it at runtime).
    return this.prisma.patient.create({
      data: { ...(rest as Record<string, unknown>), dob: dob ? new Date(dob) : null, doctorId } as Prisma.PatientUncheckedCreateInput,
    });
  }

  // Create a NEW patient X related to an EXISTING patient T, writing reciprocal
  // family-tree links to both. `relation` is X's role relative to T (X is T's
  // <relation>). Atomic — both rows are written in one transaction.
  async linkNew(
    doctorId: string,
    dto: LinkPatientDto,
  ): Promise<{ newPatient: Patient; existing: Patient }> {
    const existing = await this.get(doctorId, dto.existingId); // ownership check
    const tIsMale = isMale(existing.sex);

    const relInExistingTree = canonRelation(dto.relation); // what X is to T
    const relInNewTree = inverseRelation(dto.relation, tIsMale); // what T is to X
    const newSex = dto.sex?.trim() || inferSex(dto.relation, tIsMale);
    const mobile = dto.mobile?.trim() || existing.mobile || undefined;

    const newTree: FamilyMember[] = [
      {
        name: existing.name,
        mobile: existing.mobile ?? '',
        nid: '',
        sex: existing.sex ?? '',
        relation: relInNewTree,
        patientId: existing.id,
      },
    ];

    const [newPatient, updatedExisting] = await this.prisma.$transaction(async (tx) => {
      const created = await tx.patient.create({
        data: {
          name: dto.name,
          mobile,
          sex: newSex || null,
          hospitalId: dto.hospitalId,
          dob: dto.dob ? new Date(dto.dob) : null,
          age: dto.age,
          ageAsOfYear: dto.ageAsOfYear,
          fullAddress: dto.fullAddress,
          familyMembers: newTree as unknown as Prisma.InputJsonValue,
          doctorId,
        } as Prisma.PatientUncheckedCreateInput,
      });

      const existingTree = (Array.isArray(existing.familyMembers)
        ? existing.familyMembers
        : []) as unknown as FamilyMember[];
      const nextExistingTree: FamilyMember[] = [
        ...existingTree,
        {
          name: created.name,
          mobile: created.mobile ?? '',
          nid: '',
          sex: created.sex ?? '',
          relation: relInExistingTree,
          patientId: created.id,
        },
      ];
      const updated = await tx.patient.update({
        where: { id: existing.id },
        data: { familyMembers: nextExistingTree as unknown as Prisma.InputJsonValue },
      });
      return [created, updated];
    });

    return { newPatient, existing: updatedExisting };
  }

  async update(doctorId: string, id: string, dto: UpdatePatientDto): Promise<Patient> {
    await this.get(doctorId, id); // ownership check
    const { dob, hmDrugDates, hmSelectedDrugs, familyMembers, investigationSummary, onExaminationSummary, drugHistory, incompleteRx, ...rest } = dto;
    // Loose cast: new columns may not yet be in the generated client; the DB
    // columns exist so Postgres accepts them at runtime.
    const extra = rest as Record<string, unknown>;
    if (hmSelectedDrugs !== undefined) extra.hmSelectedDrugs = hmSelectedDrugs;
    if (familyMembers !== undefined) extra.familyMembers = familyMembers as Prisma.InputJsonValue;
    if (investigationSummary !== undefined) extra.investigationSummary = investigationSummary as Prisma.InputJsonValue;
    if (onExaminationSummary !== undefined) extra.onExaminationSummary = onExaminationSummary as Prisma.InputJsonValue;
    if (drugHistory !== undefined) extra.drugHistory = drugHistory as Prisma.InputJsonValue;
    if (incompleteRx !== undefined)
      extra.incompleteRx = incompleteRx === null ? Prisma.DbNull : (incompleteRx as Prisma.InputJsonValue);
    return this.prisma.patient.update({
      where: { id },
      data: {
        ...extra,
        ...(dob !== undefined ? { dob: dob ? new Date(dob) : null } : {}),
        ...(hmDrugDates !== undefined ? { hmDrugDates: hmDrugDates as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async remove(doctorId: string, id: string): Promise<{ id: string }> {
    await this.get(doctorId, id); // ownership check
    await this.prisma.patient.delete({ where: { id } });
    return { id };
  }
}
