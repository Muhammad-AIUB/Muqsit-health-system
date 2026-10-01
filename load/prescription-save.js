// k6 run load/prescription-save.js
// POST /prescriptions with 5 item lines for a seeded patient (includes the
// awaited habit/phrase learning writes that follow the save).
import { sleep } from 'k6';
import { ensureLogin, options as opts, prescriptionSave, summarise } from './lib.js';

export const options = opts(['login', 'prescription_save']);

export default function () {
  const doctor = ensureLogin();
  prescriptionSave(doctor);
  sleep(1);
}

export const handleSummary = (data) =>
  summarise('prescription-save', data, ['endpoint:prescription_save', 'endpoint:login']);
