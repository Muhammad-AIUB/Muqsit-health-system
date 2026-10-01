// Shared by every k6 script in this folder. Importing it is mandatory: the
// guard below runs in init context and refuses any target but the throwaway
// test API. The dev API on :4000 talks to the PRODUCTION database.
import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:4100';
const ALLOWED = ['http://localhost:4100', 'http://127.0.0.1:4100'];
if (ALLOWED.indexOf(BASE_URL) === -1) {
  throw new Error(
    `REFUSING TO RUN: BASE_URL must be exactly ${ALLOWED.join(' or ')} (got "${BASE_URL}"). ` +
      'Load tests only ever hit the test API started with `npm run test:serve`.',
  );
}
export const API = `${BASE_URL}/api`;

// Written by server/test/seed-load.ts.
const seed = new SharedArray('seed', () => [JSON.parse(open('./.seed.json'))])[0];
export const PASSWORD = seed.password;
export const DOCTORS = seed.doctors;

// One seeded doctor per VU (wraps when VUs > doctors).
export function doctorForVu() {
  return DOCTORS[(exec.vu.idInTest - 1) % DOCTORS.length];
}
export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Standard profile: ramp 0 -> 20 VUs in 20 s, hold 60 s, ramp down 10 s.
export const STAGES = [
  { duration: '20s', target: 20 },
  { duration: '60s', target: 20 },
  { duration: '10s', target: 0 },
];

// Pass/fail thresholds common to all scenarios, plus one always-true
// threshold per endpoint so k6 keeps a per-endpoint sub-metric in the summary.
export function thresholds(endpoints) {
  const t = {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  };
  for (const e of endpoints) {
    t[`http_req_duration{endpoint:${e}}`] = ['max>=0'];
    t[`http_reqs{endpoint:${e}}`] = ['count>=0'];
    t[`http_req_failed{endpoint:${e}}`] = ['rate>=0'];
  }
  return t;
}

// k6 empties the VU's cookie jar after every iteration by default, which would
// sign the VU out after its first request. Every script must spread this.
export const SESSION_OPTIONS = { noCookiesReset: true };

export function options(endpoints) {
  return {
    ...SESSION_OPTIONS,
    stages: STAGES,
    thresholds: thresholds(endpoints),
    summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'p(99)', 'max'],
  };
}

// At most a few failure bodies per VU reach the log: enough to diagnose,
// not enough to flood.
let logged = 0;
export function report(res, endpoint, expected) {
  const ok = check(
    res,
    { [`${endpoint} status ${expected}`]: (r) => r.status === expected },
    { endpoint },
  );
  if (!ok && logged < 3) {
    logged += 1;
    console.error(
      `[${endpoint}] status=${res.status} error=${res.error || ''} body=${String(res.body).slice(0, 300)}`,
    );
  }
  return ok;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// POST /auth/login. k6 keeps one cookie jar per VU, so the httpOnly access
// cookie set here rides on every later request of the same VU. The test
// server swaps the throttler storage for a no-op, so login is not rate limited.
export function login(doctor) {
  const res = http.post(
    `${API}/auth/login`,
    JSON.stringify({ identifier: doctor.email, password: PASSWORD }),
    { headers: JSON_HEADERS, tags: { endpoint: 'login' } },
  );
  report(res, 'login', 200);
  return res;
}

// Log in once per VU (the access token lives 15 min; every run here is shorter).
let signedIn = false;
export function ensureLogin() {
  const doctor = doctorForVu();
  if (!signedIn) signedIn = login(doctor).status === 200;
  return doctor;
}

// 2-4 letter prefixes of the brand/generic names in
// server/test/support/medicines.sql. Every one has at least one hit.
export const MEDICINE_PREFIXES = [
  'na', 'nap', 'napa', 'ba', 'bar', 'barc', 'en', 'ent', 'enta',
  'se', 'ser', 'serg', 'ma', 'max', 'maxp', 'pa', 'par', 'para', 'es', 'eso', 'esom',
];

export function medicineSearch() {
  const q = pick(MEDICINE_PREFIXES);
  const res = http.get(`${API}/medicines/search?q=${q}`, { tags: { endpoint: 'medicine_search' } });
  report(res, 'medicine_search', 200);
  check(
    res,
    { 'medicine_search has hits': (r) => r.status === 200 && r.json().length > 0 },
    { endpoint: 'medicine_search' },
  );
  return res;
}

export function patientLookup(doctor) {
  const p = pick(doctor.patients);
  const res = http.get(`${API}/patients/by-mobile?mobile=${p.mobile}`, {
    tags: { endpoint: 'patient_lookup' },
  });
  report(res, 'patient_lookup', 200);
  check(
    res,
    { 'patient_lookup finds the patient': (r) => r.status === 200 && r.json().some((x) => x.id === p.id) },
    { endpoint: 'patient_lookup' },
  );
  return res;
}

// Five item lines, each copied verbatim from an existing server spec
// (prescriptions.service.spec.ts, rx-habits/blocks.spec.ts). They are test
// fixtures for exercising the write path, not clinical content.
const RX_ITEMS = [
  { drug: 'Tablet. Napa 500mg', dose: '1+1+1', duration: '7 days', instruction: '', order: 0, isNote: false },
  { drug: 'Tablet. Uparen 15mg', dose: '0+0+3', duration: '1 month', instruction: 'after meal', order: 1 },
  { drug: '', dose: '0+0+1', duration: 'continue', instruction: 'after meal', order: 2, isCont: true },
  { drug: 'Tablet. X 5mg', dose: '3', duration: '', instruction: '', order: 3 },
  { drug: 'Review sugar chart', dose: '', duration: '', instruction: '', order: 4, isNote: true },
];

export function prescriptionSave(doctor) {
  const p = pick(doctor.patients);
  const res = http.post(
    `${API}/prescriptions`,
    JSON.stringify({ patientId: p.id, items: RX_ITEMS }),
    { headers: JSON_HEADERS, tags: { endpoint: 'prescription_save' } },
  );
  report(res, 'prescription_save', 201);
  check(
    res,
    { 'prescription_save returns 5 items': (r) => r.status === 201 && r.json().items.length === 5 },
    { endpoint: 'prescription_save' },
  );
  return res;
}

// ── Summary ────────────────────────────────────────────────────────────────
const ms = (v) => (v === undefined ? '-' : v.toFixed(1));

// `groups`: tag expressions such as "endpoint:login" or "stage:vu50".
// `groupSeconds`: when each group covers a fixed window (the stress steps),
// rps for those rows is requests / that window instead of / the whole run.
export function summarise(name, data, groups, groupSeconds) {
  const m = data.metrics;
  const secs = data.state.testRunDurationMs / 1000;
  const rows = [];
  const line = (label, reqs, failed, dur, window) => {
    const count = reqs ? reqs.values.count : 0;
    rows.push({
      label,
      requests: count,
      rps: window ? count / window : reqs ? reqs.values.rate : 0,
      errorRate: failed ? failed.values.rate : 0,
      p50: dur ? dur.values.med : undefined,
      p95: dur ? dur.values['p(95)'] : undefined,
      p99: dur ? dur.values['p(99)'] : undefined,
      max: dur ? dur.values.max : undefined,
    });
  };
  line('ALL', m.http_reqs, m.http_req_failed, m.http_req_duration);
  for (const g of groups) {
    line(g, m[`http_reqs{${g}}`], m[`http_req_failed{${g}}`], m[`http_req_duration{${g}}`], groupSeconds);
  }
  const failedThresholds = [];
  for (const k of Object.keys(m)) {
    const th = m[k].thresholds || {};
    for (const expr of Object.keys(th)) if (!th[expr].ok) failedThresholds.push(`${k}: ${expr}`);
  }
  const pad = (s, n) => String(s).padEnd(n);
  let text = `\n${name}  (${secs.toFixed(0)} s, max ${m.vus_max ? m.vus_max.values.max : '?'} VUs)\n`;
  text +=
    pad('group', 44) + pad('reqs', 9) + pad('rps*', 9) + pad('err %', 9) +
    pad('p50 ms', 10) + pad('p95 ms', 10) + pad('p99 ms', 10) + 'max ms\n';
  for (const r of rows) {
    text +=
      pad(r.label, 44) + pad(r.requests, 9) + pad(r.rps.toFixed(1), 9) +
      pad((r.errorRate * 100).toFixed(2), 9) + pad(ms(r.p50), 10) + pad(ms(r.p95), 10) +
      pad(ms(r.p99), 10) + ms(r.max) + '\n';
  }
  text += groupSeconds
    ? `* rps = requests / ${groupSeconds} s hold window per group (ALL: / whole run)\n`
    : '* rps = requests / whole run duration (ramps included)\n';
  text += `checks: ${m.checks ? (m.checks.values.rate * 100).toFixed(2) : '-'} % passed\n`;
  text += failedThresholds.length
    ? `THRESHOLDS FAILED: ${failedThresholds.join('; ')}\n`
    : 'thresholds: all passed\n';

  const dir = __ENV.RESULTS_DIR || 'load/results';
  const tag = __ENV.RUN_TAG ? `-${__ENV.RUN_TAG}` : '';
  return {
    stdout: text,
    [`${dir}/${name}${tag}.txt`]: text,
    [`${dir}/${name}${tag}.json`]: JSON.stringify(
      { scenario: name, durationSec: secs, rows, failedThresholds, metrics: m },
      null,
      1,
    ),
  };
}
