import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { ModulesContainer } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

// Route discovery for the contract specs. Read-only: nothing here issues a
// request or touches the database.

export interface DiscoveredRoute {
  /** `METHOD /api/path/:param`, exactly as declared. */
  route: string;
  /** Same, with every `:name` folded to `:p` — the comparison key. */
  key: string;
  controller: string;
  handler: string;
  /** Class-level + method-level `@UseGuards`, by class name. */
  guards: string[];
  /** The `@Body()` parameter's class; `null` when the handler takes no body. */
  bodyType: (new (...args: unknown[]) => unknown) | null;
  /** `@Body('field')` — only part of the body is bound, so no whole-body DTO. */
  bodyIsPartial: boolean;
}

export const routeKey = (method: string, path: string): string =>
  `${method.toUpperCase()} ${path.replace(/:[A-Za-z0-9_]+/g, ':p')}`;

const clean = (p: string): string => p.replace(/^\/+|\/+$/g, '');

const joinPath = (...parts: string[]): string =>
  '/' + parts.map(clean).filter(Boolean).join('/');

const asList = (v: unknown): string[] =>
  Array.isArray(v) ? (v as string[]) : [typeof v === 'string' ? v : ''];

const guardName = (g: unknown): string =>
  typeof g === 'function' ? g.name : (g as object)?.constructor?.name ?? '?';

/** Every route handler Nest knows about, read from decorator metadata. */
export function discoverRoutes(
  app: NestExpressApplication,
  prefix = 'api',
): DiscoveredRoute[] {
  const out: DiscoveredRoute[] = [];
  const seen = new Set<unknown>();
  for (const mod of app.get(ModulesContainer).values()) {
    for (const wrapper of mod.controllers.values()) {
      const cls = wrapper.metatype as (new (...a: unknown[]) => unknown) | null;
      if (!cls || seen.has(cls)) continue;
      seen.add(cls);
      const classGuards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, cls) ?? [];
      const names = new Set<string>();
      for (let p = cls.prototype; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
        Object.getOwnPropertyNames(p).forEach((n) => names.add(n));
      }
      for (const name of names) {
        if (name === 'constructor') continue;
        const desc = Object.getOwnPropertyDescriptor(cls.prototype, name);
        const fn = desc ? desc.value : cls.prototype[name];
        if (typeof fn !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod | undefined;
        if (method === undefined) continue;
        const methodGuards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, fn) ?? [];

        const args: Record<string, { index: number; data?: unknown }> =
          Reflect.getMetadata(ROUTE_ARGS_METADATA, cls, name) ?? {};
        const body = Object.entries(args).find(
          ([k]) => Number(k.split(':')[0]) === RouteParamtypes.BODY,
        )?.[1];
        const paramTypes: unknown[] =
          Reflect.getMetadata('design:paramtypes', cls.prototype, name) ?? [];

        for (const cp of asList(Reflect.getMetadata(PATH_METADATA, cls))) {
          for (const mp of asList(Reflect.getMetadata(PATH_METADATA, fn))) {
            const path = joinPath(prefix, cp, mp);
            const verb = RequestMethod[method];
            out.push({
              route: `${verb} ${path}`,
              key: routeKey(verb, path),
              controller: cls.name,
              handler: name,
              guards: [...classGuards, ...methodGuards].map(guardName),
              bodyType: body ? ((paramTypes[body.index] as DiscoveredRoute['bodyType']) ?? null) : null,
              bodyIsPartial: !!body && body.data !== undefined,
            });
          }
        }
      }
    }
  }
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

/** What Express actually has mounted — the independent second source. */
export function expressRoutes(app: NestExpressApplication): string[] {
  const stack: {
    route?: { path: string | string[]; methods: Record<string, boolean> };
  }[] = app.getHttpAdapter().getInstance()._router?.stack ?? [];
  const out: string[] = [];
  for (const layer of stack) {
    if (!layer.route) continue;
    for (const path of [layer.route.path].flat()) {
      for (const [m, on] of Object.entries(layer.route.methods)) {
        if (on) out.push(`${m.toUpperCase()} ${path}`);
      }
    }
  }
  return out.sort();
}
