import { Prisma } from '@prisma/client';

/**
 * ⚕️ THE ONE definition of which patients a practice can reach — the `where` that
 * `PatientsService`, the OPD queue, IPD admission and prescription create all
 * use, so that the four can never disagree about whose patient is whose.
 *
 * A practice (`doctorId` = the workstation doctor) reaches a patient when:
 *   1. the patient is its own, or
 *   2. it was assigned as the patient's supervising doctor (team chat), or
 *   3. it opened the patient with the code sent to the patient's own phone
 *      (`PatientAccessGrant`, 16/11/2026) — and neither side is isolated.
 *
 * ISOLATION (admin Profile settings): a grant counts only while the practice that
 * holds it is not isolated and the patient's owner is not isolated either. A
 * patient with no owner (their doctor's account was deleted) has no owner to
 * isolate. The isolation is read here, in the query, so a flag turned on later
 * closes access that was already given — nothing is "grandfathered".
 *
 * Clause 3 does NOT make the practice a member of the patient's team chat (that
 * is `PatientSupervisor` only), and the table in `docs/rules/access-and-scoping.md`
 * applies to it as it does to a supervising doctor: reads and prescribes fresh
 * under its own `doctorId`, never sees the owner's prescriptions, never edits the
 * owner's record, never deletes the patient.
 */
export function patientReachWhere(doctorId: string): Prisma.PatientWhereInput {
  return {
    OR: [
      { doctorId },
      { supervisors: { some: { doctorId } } },
      {
        AND: [
          { accessGrants: { some: { doctorId, doctor: { isolated: false } } } },
          OWNER_NOT_ISOLATED,
        ],
      },
    ],
  };
}

/**
 * A patient whose owner is not isolated — or who has none (their doctor's account
 * was deleted: there is no one to isolate). The ONE statement of it: the reach
 * above, the search for patients of other practices, and asking for a code all
 * use it, so an isolated practice's patients are closed to all three together.
 */
export const OWNER_NOT_ISOLATED: Prisma.PatientWhereInput = {
  OR: [{ doctorId: null }, { doctor: { isolated: false } }],
};
