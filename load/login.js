// k6 run load/login.js
// Every iteration is a fresh sign-in (bcrypt + JWT + refresh-token row).
import { sleep } from 'k6';
import { doctorForVu, login, options as opts, summarise } from './lib.js';

export const options = opts(['login']);

export default function () {
  login(doctorForVu());
  sleep(1);
}

export const handleSummary = (data) => summarise('login', data, ['endpoint:login']);
