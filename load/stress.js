// k6 run load/stress.js
// Read-path stress probe: medicine search + patient lookup, stepping
// 20 -> 50 -> 100 VUs (30 s each). Every request is tagged with the step it
// ran in, so the summary shows where p95 or the error rate breaks.
import { sleep } from 'k6';
import exec from 'k6/execution';
import { SESSION_OPTIONS, ensureLogin, medicineSearch, patientLookup, summarise } from './lib.js';

const STEPS = ['vu20', 'vu50', 'vu100'];
const ENDPOINTS = ['medicine_search', 'patient_lookup'];
const RAMP = 5;
const HOLD = 30;

const groups = [];
for (const s of STEPS) {
  groups.push(`stage:${s}`);
  for (const e of ENDPOINTS) groups.push(`stage:${s},endpoint:${e}`);
}
const thresholds = {};
for (const g of groups) {
  thresholds[`http_req_duration{${g}}`] = ['max>=0'];
  thresholds[`http_reqs{${g}}`] = ['count>=0'];
  thresholds[`http_req_failed{${g}}`] = ['rate>=0'];
}

// A probe, not a gate: no pass/fail thresholds, it reports where things bend.
export const options = {
  ...SESSION_OPTIONS,
  stages: [
    { duration: `${RAMP}s`, target: 20 },
    { duration: `${HOLD}s`, target: 20 },
    { duration: `${RAMP}s`, target: 50 },
    { duration: `${HOLD}s`, target: 50 },
    { duration: `${RAMP}s`, target: 100 },
    { duration: `${HOLD}s`, target: 100 },
    { duration: `${RAMP}s`, target: 0 },
  ],
  thresholds,
  summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  return { start: Date.now() };
}

// Only the hold part of each step is tagged; ramps are tagged "ramp".
function stageAt(elapsedSec) {
  const step = RAMP + HOLD;
  const i = Math.floor(elapsedSec / step);
  const within = elapsedSec - i * step;
  return i < STEPS.length && within >= RAMP ? STEPS[i] : 'ramp';
}

export default function (data) {
  const doctor = ensureLogin();
  exec.vu.metrics.tags.stage = stageAt((Date.now() - data.start) / 1000);
  if (Math.random() < 0.6) medicineSearch();
  else patientLookup(doctor);
  sleep(0.1);
}

export const handleSummary = (data) => summarise('stress', data, groups, HOLD);
