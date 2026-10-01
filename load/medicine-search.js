// k6 run load/medicine-search.js
// The prescription pad type-ahead: GET /medicines/search?q=<2-4 letters>.
import { sleep } from 'k6';
import { ensureLogin, medicineSearch, options as opts, summarise } from './lib.js';

export const options = opts(['login', 'medicine_search']);

export default function () {
  ensureLogin();
  medicineSearch();
  sleep(0.3); // roughly a type-ahead debounce
}

export const handleSummary = (data) =>
  summarise('medicine-search', data, ['endpoint:medicine_search', 'endpoint:login']);
