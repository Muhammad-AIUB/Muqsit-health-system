import { join, relative } from 'path';
import * as ts from 'typescript';

// Static reader for the client's API layer. Uses the TypeScript compiler API to
// find every `apiFetch(path, { method, body: JSON.stringify(x) })` call in
// client/src/lib/api.ts and resolve the TYPE of `x` — the property names the
// client is allowed to send. Nothing is executed and nothing is guessed: a
// payload whose type is `unknown` / an index signature is reported as opaque.

const REPO = join(__dirname, '..', '..', '..');
const CLIENT = join(REPO, 'client');
export const CLIENT_API_FILE = join(CLIENT, 'src', 'lib', 'api.ts');

export interface ClientCall {
  method: string;
  /** `/api/...` with every interpolated segment as `:p`; null if not resolvable. */
  path: string | null;
  /** `client/src/lib/api.ts:123` */
  at: string;
  hasBody: boolean;
  /** The expression inside JSON.stringify(...); null when the body is not that shape. */
  payload: ts.Expression | null;
  payloadText: string;
}

export type Shape =
  | { kind: 'scalar' }
  | { kind: 'opaque'; why: string }
  | { kind: 'object'; props: Map<string, { type: ts.Type; at: string }> };

export interface ClientApi {
  calls: ClientCall[];
  checker: ts.TypeChecker;
  shapeOf(type: ts.Type): Shape;
  typeOf(node: ts.Expression): ts.Type;
  /** `T[]` → `T` (repeatedly); anything else unchanged. */
  elementOf(type: ts.Type): ts.Type;
  typeName(type: ts.Type): string;
}

const HOLE = '\u0000';

function pathOf(node: ts.Expression): string | null {
  let raw: string;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    raw = node.text;
  } else if (ts.isTemplateExpression(node)) {
    raw = node.head.text + node.templateSpans.map((s) => HOLE + s.literal.text).join('');
  } else {
    return null;
  }
  raw = raw.split('?')[0];
  // `/x/${id}` is a path parameter; `/x${cond ? "?a=b" : ""}` is a glued-on
  // query string and is dropped. A hole anywhere else is not resolvable.
  raw = raw.replace(new RegExp(`/${HOLE}(?=/|$)`, 'g'), '/:p').replace(new RegExp(`${HOLE}+$`), '');
  if (raw.includes(HOLE)) return null;
  return `/api${raw.replace(/\/+$/, '')}`;
}

export function readClientApi(): ClientApi {
  const cfgPath = join(CLIENT, 'tsconfig.json');
  const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, CLIENT);
  const program = ts.createProgram({
    rootNames: [CLIENT_API_FILE],
    options: { ...parsed.options, noEmit: true, incremental: false, composite: false, plugins: undefined },
  });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFiles().find(
    (f) => f.fileName.replace(/\\/g, '/').toLowerCase() === CLIENT_API_FILE.replace(/\\/g, '/').toLowerCase(),
  );
  if (!sf) throw new Error(`could not load ${CLIENT_API_FILE}`);

  const where = (node: ts.Node): string => {
    const file = node.getSourceFile();
    const { line } = file.getLineAndCharacterOfPosition(node.getStart());
    return `${relative(REPO, file.fileName).replace(/\\/g, '/')}:${line + 1}`;
  };

  const calls: ClientCall[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'apiFetch' &&
      node.arguments.length >= 1
    ) {
      const [pathArg, opts] = node.arguments;
      let method = 'GET';
      let hasBody = false;
      let payload: ts.Expression | null = null;
      let payloadText = '';
      let optsReadable = true;
      if (opts) {
        if (ts.isObjectLiteralExpression(opts)) {
          for (const p of opts.properties) {
            if (!ts.isPropertyAssignment(p) || !p.name || !('text' in p.name)) {
              optsReadable = false;
              continue;
            }
            if (p.name.text === 'method') {
              if (ts.isStringLiteralLike(p.initializer)) method = p.initializer.text.toUpperCase();
              else optsReadable = false;
            }
            if (p.name.text === 'body') {
              hasBody = true;
              const b = p.initializer;
              payloadText = b.getText(sf);
              if (
                ts.isCallExpression(b) &&
                b.expression.getText(sf) === 'JSON.stringify' &&
                b.arguments.length === 1
              ) {
                payload = b.arguments[0];
                payloadText = payload.getText(sf);
              }
            }
          }
        } else {
          optsReadable = false;
        }
      }
      // The recursive retry inside apiFetch itself forwards `path, options`.
      const isSelfRetry = ts.isIdentifier(pathArg) && !!opts && ts.isIdentifier(opts);
      if (!isSelfRetry) {
        calls.push({
          method: optsReadable ? method : '?',
          path: pathOf(pathArg),
          at: where(node),
          hasBody,
          payload,
          payloadText,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const NULLISH = ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void;

  const elementOf = (type: ts.Type): ts.Type => {
    let t = type;
    for (let i = 0; i < 5; i++) {
      if (t.isUnion()) {
        const rest = t.types.filter((m) => !(m.flags & NULLISH));
        if (rest.length !== 1) return t;
        t = rest[0];
      }
      if (checker.isArrayType(t) || checker.isTupleType(t)) {
        const args = checker.getTypeArguments(t as ts.TypeReference);
        if (args.length !== 1) return t;
        t = args[0];
        continue;
      }
      return t;
    }
    return t;
  };

  const shapeOf = (type: ts.Type): Shape => {
    if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
      return { kind: 'opaque', why: checker.typeToString(type) };
    }
    if (type.flags & ts.TypeFlags.TypeParameter) return { kind: 'opaque', why: 'type parameter' };
    if (type.isUnion()) {
      const members = type.types.filter((m) => !(m.flags & NULLISH)).map(shapeOf);
      const opaque = members.find((m) => m.kind === 'opaque');
      if (opaque) return opaque;
      const objects = members.filter((m) => m.kind === 'object') as Extract<Shape, { kind: 'object' }>[];
      if (!objects.length) return { kind: 'scalar' };
      const props = new Map<string, { type: ts.Type; at: string }>();
      for (const o of objects) for (const [k, v] of o.props) if (!props.has(k)) props.set(k, v);
      return { kind: 'object', props };
    }
    if (!(type.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection))) return { kind: 'scalar' };
    const symbols = checker.getPropertiesOfType(type);
    if (!symbols.length && checker.getIndexInfosOfType(type).length) {
      return { kind: 'opaque', why: `index signature (${checker.typeToString(type)})` };
    }
    const props = new Map<string, { type: ts.Type; at: string }>();
    for (const s of symbols) {
      const decl = s.declarations?.[0];
      props.set(s.name, {
        type: checker.getTypeOfSymbolAtLocation(s, decl ?? sf),
        at: decl ? where(decl) : '?',
      });
    }
    return { kind: 'object', props };
  };

  return {
    calls,
    checker,
    shapeOf,
    elementOf,
    typeOf: (node) => checker.getTypeAtLocation(node),
    typeName: (type) => checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation).slice(0, 80),
  };
}
