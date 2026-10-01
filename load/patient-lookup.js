// k6 run load/patient-lookup.js
// GET /patients/by-mobile?mobile= for a seeded patient of the signed-in doctor.
import { sleep } from 'k6';
import { ensureLogin, options as opts, patientLookup, summarise } from './lib.js';

export const options = opts(['login', 'patient_lookup']);

export default function () {
  const doctor = ensureLogin();
  patientLookup(doctor);
  sleep(0.3);
}

export const handleSummary = (data) =>
  summarise('patient-lookup', data, ['endpoint:patient_lookup', 'endpoint:login']);
