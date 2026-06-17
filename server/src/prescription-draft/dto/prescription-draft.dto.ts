import { IsObject } from 'class-validator';

// Upsert the doctor's active prescription draft. `data` is the whole editor
// state as an opaque JSON object — the client owns its shape, the server just
// stores and returns it verbatim.
export class UpsertPrescriptionDraftDto {
  @IsObject() data!: Record<string, unknown>;
}
