import { getMetadataStorage } from 'class-validator';
import type * as ts from 'typescript';
import { createTestApp, TestApp } from './support/app';
import { ClientApi, ClientCall, readClientApi } from './support/client-calls';
import { DiscoveredRoute, discoverRoutes, routeKey } from './support/routes';

// CONTRACT: what the client sends vs what the server's DTO declares.
//
// main.ts uses ValidationPipe({ whitelist: true }): a property the client sends
// that the DTO does not declare is DELETED before the handler sees it, with no
// error — "saved", and silently not persisted (server/CLAUDE.md Rule 3). In a
// prescribing app that is lost patient data.
//
// Fully mechanical, no hand-maintained route table:
//   client side — the TypeScript compiler resolves the type of `x` in every
//                 `apiFetch(path, { method, body: JSON.stringify(x) })` in
//                 client/src/lib/api.ts (the only file that calls the API);
//   server side — the booted app's route metadata gives the handler's @Body()
//                 class, and class-validator's metadata storage gives exactly
//                 the property names the whitelist keeps. Nested DTOs
//                 (@ValidateNested + @Type) are followed.
//
// Read-only — issues no request, writes nothing.
//
// A failure here is a FINDING. Add the field to the DTO (or stop sending it);
// only add to an allowlist when the drop is known and deliberately left.

// `METHOD /api/path :: field.path` — sent by the client, absent from the DTO,
// therefore stripped by the whitelist today.
//
// POST /patients: the client types the create body as `PatientInput`
// (client/src/lib/api.ts:104), which is also the PATCH type and so carries
// ten record-level fields that only `UpdatePatientDto` declares. That the
// server strips them on create is deliberate (server/CLAUDE.md: "declared on
// it alone (not on Create/Link) … One door — keep it that way"), and no caller
// passes them today — PatientSettingsView sends the family tree and HM ticks in
// a follow-up PATCH for exactly this reason. But the TYPE lets a future caller
// write `patientsApi.create({ …, drugHistory })`, compile, and lose the data.
// The fix is a narrower create type on the client, not a wider DTO.
const KNOWN_DROPPED_FIELDS: string[] = [
  'POST /api/patients :: drugHistory',
  'POST /api/patients :: familyMembers',
  'POST /api/patients :: hmDrugDates',
  'POST /api/patients :: hmSelectedDrugs',
  'POST /api/patients :: hmSymptomDates',
  'POST /api/patients :: imageThumbs',
  'POST /api/patients :: incompleteRx',
  'POST /api/patients :: investigationSummary',
  'POST /api/patients :: lastRxImageKey',
  'POST /api/patients :: onExaminationSummary',
];

// Payloads (or parts of one) whose property names cannot be resolved
// statically — the type is `unknown` / an index signature. NOT checked.
const KNOWN_OPAQUE_PAYLOADS: string[] = [];

// Mutations whose handler does not bind the body to a validated DTO class
// (inline type → ValidationPipe skips it → nothing is stripped, and nothing is
// validated either).
const KNOWN_NO_DTO: string[] = [
  // mirror.controller.ts: `@Body() body: { connId: string; type: string; payload: unknown }`
  // — an inline type, so the body reaches the handler unvalidated.
  'POST /api/mirror/publish',
];

// DTO properties marked @ValidateNested whose element class cannot be found
// (no @Type). The nested object's fields are NOT checked.
const KNOWN_UNTYPED_NESTED: string[] = [];

/* eslint-disable @typescript-eslint/no-var-requires */
const { defaultMetadataStorage } = require('class-transformer/cjs/storage') as {
  defaultMetadataStorage: {
    findTypeMetadata(
      target: unknown,
      property: string,
    ): { typeFunction: (o?: unknown) => unknown } | undefined;
  };
};

type Ctor = new (...args: unknown[]) => unknown;

interface DtoProps {
  all: Set<string>;
  nested: Set<string>;
}

function dtoProps(cls: Ctor): DtoProps {
  const metas = getMetadataStorage().getTargetValidationMetadatas(cls, '', false, false);
  return {
    all: new Set(metas.map((m) => m.propertyName)),
    nested: new Set(metas.filter((m) => m.type === 'nestedValidation').map((m) => m.propertyName)),
  };
}

function nestedClass(cls: Ctor, prop: string): Ctor | null {
  const viaType = defaultMetadataStorage.findTypeMetadata(cls, prop)?.typeFunction();
  if (typeof viaType === 'function') return viaType as Ctor;
  const design = Reflect.getMetadata('design:type', cls.prototype, prop);
  if (typeof design === 'function' && design !== Object && design !== Array) return design as Ctor;
  return null;
}

const MUTATIONS = ['POST', 'PUT', 'PATCH'];
const sorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort();

function exact(label: string, actual: string[], pinned: string[], detail: Map<string, string>): void {
  const fresh = actual.filter((k) => !pinned.includes(k));
  const healed = pinned.filter((k) => !actual.includes(k));
  if (!fresh.length && !healed.length) return;
  throw new Error(
    [
      fresh.length ? `${label} — NEW (not in the allowlist):` : '',
      ...fresh.map((k) => `  + ${k}${detail.get(k) ? `\n      ${detail.get(k)}` : ''}`),
      healed.length ? `${label} — in the allowlist but no longer true, remove:` : '',
      ...healed.map((k) => `  - ${k}`),
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

describe('contract: client payloads vs server DTOs', () => {
  let t: TestApp;
  let byKey: Map<string, DiscoveredRoute>;
  let client: ClientApi;

  const dropped = new Map<string, string>();
  const opaque = new Map<string, string>();
  const noDto = new Map<string, string>();
  const untypedNested = new Map<string, string>();
  const checked: string[] = [];

  function compare(
    route: string,
    type: ts.Type,
    cls: Ctor,
    prefix: string,
    call: ClientCall,
    seen: Set<string>,
  ): void {
    const shape = client.shapeOf(type);
    if (shape.kind === 'scalar') return;
    if (shape.kind === 'opaque') {
      opaque.set(`${route} :: ${prefix || '(body)'}`, `${call.at}  type: ${shape.why}`);
      return;
    }
    const guard = `${cls.name}|${prefix}`;
    if (seen.has(guard)) return;
    seen.add(guard);
    const dto = dtoProps(cls);
    for (const [name, prop] of shape.props) {
      const path = prefix ? `${prefix}.${name}` : name;
      if (!dto.all.has(name)) {
        dropped.set(
          `${route} :: ${path}`,
          `client: ${prop.at} (sent at ${call.at})  server: ${cls.name} has no "${name}"`,
        );
        continue;
      }
      if (!dto.nested.has(name)) continue; // free-form on the server: passes whole
      const inner = nestedClass(cls, name);
      if (!inner) {
        untypedNested.set(`${route} :: ${path}`, `${cls.name}.${name} is @ValidateNested without @Type`);
        continue;
      }
      compare(route, client.elementOf(prop.type), inner, path, call, seen);
    }
  }

  beforeAll(async () => {
    t = await createTestApp();
    byKey = new Map(discoverRoutes(t.app).map((r) => [r.key, r]));
    client = readClientApi();

    for (const call of client.calls) {
      if (!call.path || !MUTATIONS.includes(call.method) || !call.hasBody) continue;
      const route = `${call.method} ${call.path}`;
      const server = byKey.get(routeKey(call.method, call.path));
      if (!server) continue; // reported by the "real route" test
      if (!call.payload) {
        opaque.set(`${route} :: (body)`, `${call.at}  body is not JSON.stringify(x): ${call.payloadText}`);
        continue;
      }
      const cls = server.bodyType as Ctor | null;
      const validated =
        !!cls && !server.bodyIsPartial && ![Object, Array, String, Number, Boolean].includes(cls as never);
      if (!validated) {
        noDto.set(route, `${server.controller}#${server.handler} (client: ${call.at})`);
        continue;
      }
      checked.push(`${route}  ${client.typeName(client.typeOf(call.payload))} → ${cls!.name}`);
      compare(route, client.typeOf(call.payload), cls!, '', call, new Set());
    }

    if (process.env.CONTRACT_REPORT) {
      process.stdout.write(
        [
          '',
          `CHECKED (${checked.length}):`,
          ...checked.map((c) => `  ${c}`),
          'DROPPED:',
          ...[...dropped].map(([k, v]) => `  ${k}\n      ${v}`),
          'OPAQUE:',
          ...[...opaque].map(([k, v]) => `  ${k}\n      ${v}`),
          'NO DTO:',
          ...[...noDto].map(([k, v]) => `  ${k}\n      ${v}`),
          'UNTYPED NESTED:',
          ...[...untypedNested].map(([k, v]) => `  ${k}\n      ${v}`),
          'ALL CALLS:',
          ...client.calls.map((c) => `  ${c.method} ${c.path}  ${c.at}${c.hasBody ? '  body=' + c.payloadText : ''}`),
          '',
        ].join('\n'),
      );
    }
  });
  afterAll(async () => {
    await t.close();
  });

  it('reads every API call in client/src/lib/api.ts', () => {
    // Guards against the reader silently finding nothing after a refactor.
    expect(client.calls.length).toBeGreaterThan(60);
    const unreadable = client.calls.filter((c) => !c.path || c.method === '?').map((c) => c.at);
    expect(unreadable).toEqual([]);
  });

  it('calls only routes the API really serves', () => {
    const missing = client.calls
      .filter((c) => c.path && !byKey.has(routeKey(c.method, c.path)))
      .map((c) => `${c.method} ${c.path}  (${c.at})`);
    expect(missing).toEqual([]);
  });

  it('checks a meaningful number of mutation payloads', () => {
    expect(checked.length).toBeGreaterThan(25);
  });

  it('sends no property the DTO would silently drop', () => {
    exact('Client field stripped by ValidationPipe({ whitelist: true })', sorted(dropped.keys()), KNOWN_DROPPED_FIELDS, dropped);
  });

  it('pins the payloads that cannot be resolved statically', () => {
    exact('Payload not statically resolvable (NOT checked)', sorted(opaque.keys()), KNOWN_OPAQUE_PAYLOADS, opaque);
  });

  it('pins the mutations that have no validated DTO', () => {
    exact('Mutation without a validated @Body() DTO', sorted(noDto.keys()), KNOWN_NO_DTO, noDto);
  });

  it('pins the nested DTO properties whose class is unknown', () => {
    exact('@ValidateNested without a resolvable class (NOT checked)', sorted(untypedNested.keys()), KNOWN_UNTYPED_NESTED, untypedNested);
  });
});
