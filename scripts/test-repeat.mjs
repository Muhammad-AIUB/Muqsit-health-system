// Flaky-test detector. Runs one suite N times and reports every test whose
// outcome was not the same on every run. A test that passes 4 times out of 5
// is a defect — in the test or in the code — and a retry only hides it.
//
//   node scripts/test-repeat.mjs server 3     (jest unit suite)
//   node scripts/test-repeat.mjs int 5        (integration, needs the test DB)
//   node scripts/test-repeat.mjs client 3     (vitest)
//
// Exit code 1 when anything was flaky or failed on every run.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [suite, nArg] = process.argv.slice(2);
const runs = Number(nArg ?? 3);

const SUITES = {
  server: { cwd: 'server', cmd: (out) => `npx jest --json --outputFile="${out}"` },
  int: { cwd: 'server', cmd: (out) => `npx jest --config ./test/jest-int.json --json --outputFile="${out}"` },
  client: { cwd: 'client', cmd: (out) => `npx vitest run --reporter=json --outputFile="${out}"` },
};
const def = SUITES[suite];
if (!def || !Number.isInteger(runs) || runs < 2) {
  console.error('usage: node scripts/test-repeat.mjs <server|int|client> <runs>=2+>');
  process.exit(2);
}

const outDir = join(root, '.test-repeat');
mkdirSync(outDir, { recursive: true });

// test id → status per run ("passed" | "failed" | "missing")
const seen = new Map();
const durations = [];

for (let i = 0; i < runs; i += 1) {
  const out = join(outDir, `${suite}-${i}.json`);
  rmSync(out, { force: true });
  const started = Date.now();
  spawnSync(def.cmd(out), { cwd: join(root, def.cwd), shell: true, stdio: 'ignore' });
  durations.push(Math.round((Date.now() - started) / 1000));

  let report;
  try {
    report = JSON.parse(readFileSync(out, 'utf8'));
  } catch {
    console.error(`run ${i + 1}: no report written — the suite did not start`);
    process.exit(2);
  }
  // jest and vitest's json reporter share this shape.
  for (const file of report.testResults ?? []) {
    const name = relative(root, file.name ?? file.testFilePath ?? '').replace(/\\/g, '/');
    for (const t of file.assertionResults ?? []) {
      if (t.status === 'pending' || t.status === 'skipped' || t.status === 'todo') continue;
      const id = `${name} › ${t.fullName ?? t.title}`;
      if (!seen.has(id)) seen.set(id, Array(runs).fill('missing'));
      seen.get(id)[i] = t.status;
    }
  }
  console.log(`run ${i + 1}/${runs}: ${durations[i]}s`);
}

const flaky = [];
const alwaysFailing = [];
for (const [id, statuses] of seen) {
  const unique = new Set(statuses);
  if (unique.size > 1) flaky.push({ id, statuses });
  else if (!unique.has('passed')) alwaysFailing.push(id);
}

console.log(`\n${suite}: ${seen.size} tests × ${runs} runs, durations ${durations.join('s, ')}s`);
console.log(`flaky: ${flaky.length}   failing every run: ${alwaysFailing.length}`);
for (const f of flaky) console.log(`  FLAKY  ${f.id}\n         ${f.statuses.join(' → ')}`);
for (const id of alwaysFailing) console.log(`  FAIL   ${id}`);

process.exit(flaky.length || alwaysFailing.length ? 1 : 0);
