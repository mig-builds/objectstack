// Copyright (c) 2026 ObjectStack. Licensed under the Apache-2.0 license.

/**
 * [ADR-0131 D6 regime C] The generic `/data` door refuses a `sys_sharing_rule`
 * row that takes a declared rule's name, over HTTP, in the ADR-0112 envelope.
 *
 * A declared sharing rule (a stack's `sharingRules`) is read-only and clonable:
 * it is customised by a clone under ANOTHER name plus the declared rule
 * switched off in the activation ledger. So no organization-authored row may
 * take a declared rule's name — not a new row, and not an existing row renamed
 * onto it. `content/docs/permissions/sharing-rules.mdx` publishes the answer:
 * `409 RESOURCE_CONFLICT`, for Setup's New and edit forms and for scripts and
 * imports through the data API.
 *
 * The refusal is plugin-sharing's `bindDeclaredRuleNameGuard`
 * (`DeclaredSharingRuleNameConflictError`), a `beforeInsert` / `beforeUpdate`
 * hook on `sys_sharing_rule`. Its unit pins drive the hook over a fake engine
 * and the `POST /sharing/rules` door's pin builds the thrown shape by hand;
 * neither reaches the door those forms and scripts actually write through.
 * This file does: a booted composition, an administrator signed in, and
 * `POST` / `PATCH {basePath}/data/sys_sharing_rule` over the HTTP app, so what
 * is asserted is the wire answer a client receives — `status` and `code`.
 *
 * Composition: the plugin set, in order, `@objectstack/verify`'s `bootStack`
 * uses (it mirrors `objectstack dev` / `serve`), as the #21516 and #21454 pins
 * assemble it, with the production `autoDefaultOrganization` default so the
 * administrator's rows have an organization to belong to. The declared rule
 * comes from the application's own `sharingRules`, as a real stack declares
 * one. The boot is paid in `beforeAll`, never inside a case.
 *
 * The CONTROL is the same create under a name no declaration holds: it lands,
 * so the 409 is the guard's answer about the name and not the rig refusing
 * every write to this object.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ObjectKernel } from '@objectstack/core';
import { ObjectQLPlugin } from '@objectstack/objectql';
import { HonoServerPlugin } from '@objectstack/plugin-hono-server';
import { createRestApiPlugin } from '@objectstack/rest';
import { AuthPlugin } from '@objectstack/plugin-auth';
import { SecurityPlugin, appSecurityPluginOptions } from '@objectstack/plugin-security';
import { SharingServicePlugin } from '@objectstack/plugin-sharing';
import { PlatformObjectsPlugin } from '@objectstack/platform-objects/plugin';
import { HttpStatusErrorCodeMap } from '@objectstack/spec/api';
import { AppPlugin } from './app-plugin.js';
import { DefaultDatasourcePlugin } from './default-datasource-plugin.js';
import { createDispatcherPlugin } from './dispatcher-plugin.js';

const BOOT_TIMEOUT = 180_000;
const ORIGIN = 'http://localhost:3000';
const API = '/api/v1';
const ADMIN = { email: 'admin@objectos.ai', password: 'admin123' };
const RULES = '/data/sys_sharing_rule';

/** The rule the application declares — the name no authored row may take. */
const DECLARED = 'pin_red_projects_declared';
/** A name no declaration holds: the control's, and the row the rename starts from. */
const OWN = 'pin_red_projects_ours';

const PIN_APP: any = {
  manifest: { id: 'com.pin.declaredrulename', name: 'Declared rule name pins', version: '1.0.0' },
  objects: [
    {
      name: 'pin_project',
      label: 'Pin project',
      fields: {
        title: { type: 'text', label: 'Title' },
        status: { type: 'text', label: 'Status' },
      },
    },
  ],
  sharingRules: [
    {
      type: 'criteria',
      name: DECLARED,
      label: 'Red projects (declared)',
      object: 'pin_project',
      condition: "record.status == 'red'",
      accessLevel: 'read',
      sharedWith: { type: 'user', value: 'usr_declared_recipient' },
      active: true,
    },
  ],
};

/** A complete authored row, as Setup's New form posts it. */
const authoredRow = (name: string) => ({
  name,
  label: 'Red projects (ours)',
  object_name: 'pin_project',
  criteria_json: JSON.stringify({ status: 'red' }),
  recipient_type: 'user',
  recipient_id: 'usr_own_recipient',
  access_level: 'read',
});

let kernel: any;
let httpServer: any;
let app: any;
let engine: any;
let adminToken: string;
let prevNodeEnv: string | undefined;

const req = (path: string, init?: RequestInit) => app.request(`${ORIGIN}${API}${path}`, init);
const as = (token: string, method: string, path: string, payload?: unknown) =>
  req(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
  });

async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** The authored rows under `name`, read past every door. */
const rowsNamed = async (name: string): Promise<any[]> =>
  engine.find('sys_sharing_rule', { where: { name }, context: { isSystem: true } });

async function signIn(who: { email: string; password: string }): Promise<string> {
  const res = await req('/auth/sign-in/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(who),
  });
  if (!res.ok) throw new Error(`pin signIn failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as any).token;
}

beforeAll(async () => {
  prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development'; // the dev-admin seed, as `objectstack dev` / bootStack arm it

  kernel = new ObjectKernel();
  await kernel.use(new ObjectQLPlugin());
  await kernel.use(new DefaultDatasourcePlugin({ driver: 'sqlite-wasm', config: { filename: ':memory:' } }));
  await kernel.use(new HonoServerPlugin({ port: 0 }));
  await kernel.use(new AppPlugin(PIN_APP));
  await kernel.use(new PlatformObjectsPlugin());
  await kernel.use(new AuthPlugin({ secret: 'declared-rule-name-data-door-secret' }));
  await kernel.use(new SecurityPlugin(appSecurityPluginOptions(PIN_APP)));
  await kernel.use(new SharingServicePlugin());
  await kernel.use(createRestApiPlugin({}));
  await kernel.use(createDispatcherPlugin({}));
  await kernel.bootstrap();

  httpServer = await kernel.getServiceAsync('http-server');
  app = httpServer.getRawApp();
  engine = await kernel.getServiceAsync('objectql');
  adminToken = await signIn(ADMIN);
}, BOOT_TIMEOUT);

afterAll(async () => {
  try { await httpServer?.close?.(); } catch { /* best-effort */ }
  try { await kernel?.shutdown?.(); } catch { /* best-effort */ }
  if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = prevNodeEnv;
}, 60_000);

describe('[ADR-0131 D6 regime C] precondition and control', () => {
  it('the application\'s rule is declared, as the sharing-rule service the guard asks reads it', async () => {
    const rules: any = await kernel.getServiceAsync('sharingRules');
    expect((await rules.declaredRuleNamed(DECLARED))?.name).toBe(DECLARED);
    expect(await rules.declaredRuleNamed(OWN)).toBeNull();
  });

  it('CONTROL: a create under a name no declaration holds lands through the same door', async () => {
    const res = await as(adminToken, 'POST', RULES, authoredRow(OWN));
    const payload = await readJson(res);
    expect(res.status, JSON.stringify(payload)).toBeGreaterThanOrEqual(200);
    expect(res.status, JSON.stringify(payload)).toBeLessThan(300);
    expect(await rowsNamed(OWN)).toHaveLength(1);
  });
});

describe('[ADR-0131 D6 regime C] POST / PATCH /data/sys_sharing_rule onto a declared rule\'s name', () => {
  it('a create taking the declared name answers 409 RESOURCE_CONFLICT, and no row lands', async () => {
    const res = await as(adminToken, 'POST', RULES, authoredRow(DECLARED));
    const payload = await readJson(res);
    expect(res.status, JSON.stringify(payload)).toBe(409);
    expect(payload?.error?.code, JSON.stringify(payload)).toBe('RESOURCE_CONFLICT');
    // The catalogue's own code for the status, not a restated pair.
    expect(HttpStatusErrorCodeMap[409]).toBe(payload?.error?.code);
    expect(await rowsNamed(DECLARED)).toEqual([]);
  });

  it('a rename onto the declared name answers 409 RESOURCE_CONFLICT, and the row keeps its name', async () => {
    const [own] = await rowsNamed(OWN);
    expect(own?.id, 'the control row the rename starts from').toBeTruthy();

    const res = await as(adminToken, 'PATCH', `${RULES}/${own.id}`, { name: DECLARED });
    const payload = await readJson(res);
    expect(res.status, JSON.stringify(payload)).toBe(409);
    expect(payload?.error?.code, JSON.stringify(payload)).toBe('RESOURCE_CONFLICT');
    expect(HttpStatusErrorCodeMap[409]).toBe(payload?.error?.code);
    expect(await rowsNamed(DECLARED)).toEqual([]);
    expect((await rowsNamed(OWN)).map((r) => r.id)).toEqual([own.id]);
  });
});
