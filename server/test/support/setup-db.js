// Prepares the throwaway test databases inside the muqsit-testdb container:
// creates each one, pushes schema.prisma into it, adds the raw `medicines`
// table and the marker the test guard looks for.
//
// `prisma db push` is forbidden against the shared production database. It is
// safe HERE and only here: DATABASE_URL and DIRECT_URL are both forced to the
// container below, and the script refuses any other target.
//
//   npm run test:db            (after: docker compose -f ../docker-compose.test.yml up -d)
const { execFileSync } = require('child_process');
const { readFileSync } = require('fs');
const { join } = require('path');

const CONTAINER = 'muqsit-testdb';
const HOST = '127.0.0.1:5544';
const MARKER = '__muqsit_test_marker';
const NAMES = ['muqsit_int_test', 'muqsit_int2_test', 'muqsit_e2e_test', 'muqsit_load_test'];

const serverDir = join(__dirname, '..', '..');
const psql = (db, sql) =>
  execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'test', '-d', db, '-q'],
    { input: sql, stdio: ['pipe', 'pipe', 'inherit'] },
  ).toString();

for (const name of NAMES) {
  if (!name.endsWith('_test')) throw new Error(`refusing: ${name}`);
  const url = `postgresql://test:test@${HOST}/${name}?schema=public`;

  const exists = psql('postgres', `SELECT 1 FROM pg_database WHERE datname = '${name}';`);
  if (!exists.includes('1')) psql('postgres', `CREATE DATABASE "${name}";`);

  execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss', '--schema', 'prisma/schema.prisma'],
    {
      cwd: serverDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    },
  );

  psql(name, readFileSync(join(__dirname, 'medicines.sql'), 'utf8'));
  psql(name, `CREATE TABLE IF NOT EXISTS "${MARKER}" (created_at timestamptz NOT NULL DEFAULT now());`);
  console.log(`✓ ${name} ready`);
}
