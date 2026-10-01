// k6 run load/mixed.js
// A clinic-shaped mix: mostly type-ahead and patient lookup, an occasional
// save, a rare re-login.
import { sleep } from 'k6';
import {
  doctorForVu,
  ensureLogin,
  login,
  medicineSearch,
  options as opts,
  patientLookup,
  prescriptionSave,
  summarise,
} from './lib.js';

const ENDPOINTS = ['medicine_search', 'patient_lookup', 'prescription_save', 'login'];
export const options = opts(ENDPOINTS);

export default function () {
  const doctor = ensureLogin();
  const r = Math.random();
  if (r < 0.55) medicineSearch();
  else if (r < 0.85) patientLookup(doctor);
  else if (r < 0.95) prescriptionSave(doctor);
  else login(doctorForVu());
  sleep(0.5);
}

export const handleSummary = (data) =>
  summarise('mixed', data, ENDPOINTS.map((e) => `endpoint:${e}`));
