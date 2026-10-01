import { readFileSync } from 'fs';
import { join } from 'path';
import { createTestApp, TestApp } from './support/app';
import { DiscoveredRoute, discoverRoutes, expressRoutes, routeKey } from './support/routes';

// CONTRACT: the routes the API really serves vs docs/API.md, and which of them
// are reachable without a session.
//
// Read-only — boots the app, inspects it, issues no request and writes nothing.
//
// A failure here is a FINDING, not a flaky test. Fix the doc or the code; only
// add to an allowlist below when the mismatch is known and deliberately left.

const API_MD = join(__dirname, '..', '..', 'docs', 'API.md');

// Real routes that docs/API.md does not list. Keys are `METHOD /api/path/:p`
// (every `:name` folded to `:p`). Empty = the doc is complete.
const KNOWN_UNDOCUMENTED: string[] = [];

// Routes docs/API.md lists that the API does not serve. Same key format.
const KNOWN_STALE_DOC: string[] = [];

// Every route with NO JwtAuthGuard, pinned exactly. A new entry here is a new
// way into the API without a session — it must be a decision, not an accident.
const PUBLIC_ROUTES: string[] = [
  // Pre-session by nature.
  'POST /api/auth/login',
  'POST /api/auth/register',
  'POST /api/auth/resend-otp',
  'POST /api/auth/verify-email',
  // Authenticated by the refresh cookie, not the access token.
  'POST /api/auth/logout',
  'POST /api/auth/refresh',
  // Deliberately public: the registration flow uploads NID / certificate
  // photos before an account exists (see upload.controller.ts).
  'POST /api/uploads/image',
];

// Controllers guarded by JwtAuthGuard but NOT WorkstationGuard, by first path
// segment. These act on the signed-in user's OWN account. A controller that
// reads practice data (patients, prescriptions, OPD, IPD…) must not appear
// here — server/CLAUDE.md Rule 1.
const JWT_ONLY_CONTROLLERS: string[] = [
  'admin', // + RolesGuard
  'assistants',
  'auth', // GET /auth/me
  'medicines',
  'mirror',
  'prescription-draft',
  'prescription-layout',
  'prescription-templates',
  'research',
  'supervised',
  'users',
  'wards',
  'workstations',
];

interface DocRoute {
  key: string;
  route: string;
  line: number;
}

// docs/API.md lists endpoints two ways, and both are read:
//   | GET | `/patients/:id` | …          ← the endpoint tables
//   `PATCH /patients/:id`                ← inline mentions (permission tables, prose)
// Query strings are dropped; paths are relative to /api. A path with anything
// but route characters (e.g. `GET /uploads/<filename>`, the static file server)
// is not an API route and is skipped.
function parseDocRoutes(md: string): DocRoute[] {
  const out: DocRoute[] = [];
  const VERB = '(GET|POST|PUT|PATCH|DELETE)';
  const add = (verb: string, raw: string, line: number) => {
    const path = raw.split('?')[0];
    if (!/^\/[A-Za-z0-9_\-/:]*$/.test(path)) return;
    const full = `/api${path.replace(/\/+$/, '')}`;
    out.push({ key: routeKey(verb, full), route: `${verb} ${full}`, line });
  };
  md.split(/\r?\n/).forEach((text, i) => {
    const row = new RegExp(`^\\|\\s*${VERB}\\s*\\|\\s*\`([^\`]+)\``).exec(text);
    if (row) add(row[1], row[2], i + 1);
    const inline = new RegExp(`\`${VERB} (/[^\`\\s]*)\``, 'g');
    for (let m = inline.exec(text); m; m = inline.exec(text)) add(m[1], m[2], i + 1);
  });
  return out;
}

const sorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort();

describe('contract: routes vs docs/API.md', () => {
  let t: TestApp;
  let routes: DiscoveredRoute[];
  let doc: DocRoute[];

  beforeAll(async () => {
    t = await createTestApp();
    routes = discoverRoutes(t.app);
    doc = parseDocRoutes(readFileSync(API_MD, 'utf8'));
  });
  afterAll(async () => {
    await t.close();
  });

  it('reads the same route list from decorator metadata and from Express', () => {
    // Two independent sources. If they disagree, the reflection the other
    // assertions rely on is missing something and nothing below can be trusted.
    expect(routes.length).toBeGreaterThan(50);
    expect(sorted(routes.map((r) => r.route))).toEqual(sorted(expressRoutes(t.app)));
  });

  it('finds the endpoint tables in docs/API.md', () => {
    // Guards against the parser silently matching nothing after a doc reformat.
    expect(doc.length).toBeGreaterThan(50);
  });

  it('documents every real route', () => {
    const documented = new Set(doc.map((d) => d.key));
    const missing = sorted(routes.filter((r) => !documented.has(r.key)).map((r) => r.key));
    const byKey = new Map(routes.map((r) => [r.key, r]));
    const fresh = missing.filter((k) => !KNOWN_UNDOCUMENTED.includes(k));
    const healed = KNOWN_UNDOCUMENTED.filter((k) => !missing.includes(k));
    if (fresh.length || healed.length) {
      throw new Error(
        [
          fresh.length ? 'Served by the API but NOT in docs/API.md:' : '',
          ...fresh.map((k) => {
            const r = byKey.get(k)!;
            return `  + ${r.route}   (${r.controller}#${r.handler})`;
          }),
          healed.length ? 'In KNOWN_UNDOCUMENTED but now documented (or gone) — remove:' : '',
          ...healed.map((k) => `  - ${k}`),
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
  });

  it('documents no route that does not exist', () => {
    const real = new Set(routes.map((r) => r.key));
    const stale = doc.filter((d) => !real.has(d.key));
    const staleKeys = sorted(stale.map((d) => d.key));
    const fresh = stale.filter((d) => !KNOWN_STALE_DOC.includes(d.key));
    const healed = KNOWN_STALE_DOC.filter((k) => !staleKeys.includes(k));
    if (fresh.length || healed.length) {
      throw new Error(
        [
          fresh.length ? 'In docs/API.md but NOT served by the API:' : '',
          ...fresh.map((d) => `  - ${d.route}   (docs/API.md:${d.line})`),
          healed.length ? 'In KNOWN_STALE_DOC but no longer stale — remove:' : '',
          ...healed.map((k) => `  - ${k}`),
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
  });

  it('pins exactly which routes need no session', () => {
    const open = sorted(
      routes.filter((r) => !r.guards.includes('JwtAuthGuard')).map((r) => r.route),
    );
    expect(open).toEqual(sorted(PUBLIC_ROUTES));
  });

  it('pins exactly which authenticated controllers skip WorkstationGuard', () => {
    const jwtOnly = sorted(
      routes
        .filter((r) => r.guards.includes('JwtAuthGuard') && !r.guards.includes('WorkstationGuard'))
        .map((r) => r.route.split(' ')[1].split('/')[2]),
    );
    expect(jwtOnly).toEqual(sorted(JWT_ONLY_CONTROLLERS));
  });

  it('never puts WorkstationGuard on a route without JwtAuthGuard before it', () => {
    // WorkstationGuard reads req.user; ahead of (or without) JwtAuthGuard it
    // has nobody to resolve a practice for.
    const wrong = routes
      .filter((r) => {
        const j = r.guards.indexOf('JwtAuthGuard');
        const w = r.guards.indexOf('WorkstationGuard');
        return w !== -1 && (j === -1 || j > w);
      })
      .map((r) => r.route);
    expect(wrong).toEqual([]);
  });
});
