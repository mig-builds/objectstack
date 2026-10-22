// Copyright (c) 2025 ObjectStack. Licensed under the Apache-2.0 license.

/**
 * #25190 — `renderTemplate`, the HTML-face renderer that took a template body
 * inline, is retired from this package's published entry (ruling 6335348115 on
 * #25082, F2 B3; ADR-0087 `runtime-export-retired`). The hole-placement rule is
 * judged where a template is saved or registered, and a body handed straight to
 * that function had neither moment, so it was the one door the rule could not
 * see.
 *
 * Pinned both ways: the entry no longer names it (its two siblings from the same
 * module stay), and a template still renders through the stored-template door —
 * the mail service, by NAME — with every hole encoded for the HTML face.
 */

import { describe, it, expect } from 'vitest';
import * as entry from './index.js';
import { EmailService, type EmailTemplateRow } from './email-service.js';

describe('plugin-email entry: the body-taking renderer is retired (#25190)', () => {
  it('the published entry does not export renderTemplate', () => {
    expect('renderTemplate' in entry).toBe(false);
  });

  it('THE CONTROL: the entry still exports its siblings from the same module', () => {
    expect(typeof entry.requireVars).toBe('function');
    expect(typeof entry.htmlToText).toBe('function');
  });

  it('a stored template still renders by name through the mail service, holes encoded for HTML', async () => {
    const row: EmailTemplateRow = {
      name: 'deal.won',
      locale: 'en-US',
      subject: 'Deal won: {{deal.name}}',
      body_html: '<p>Deal <b>{{deal.name}}</b> closed.</p>',
      active: true,
    };
    const svc = new EmailService({
      transport: { async send() { return { messageId: 'never' }; } },
      defaultFrom: { address: 'no-reply@x.com' },
      templateLoader: { async load(name) { return name === row.name ? row : null; } },
    });

    const out = await svc.renderTemplate({ template: 'deal.won', data: { deal: { name: 'A<b>' } } });

    expect(out.subject).toBe('Deal won: A<b>');
    expect(out.html).toBe('<p>Deal <b>A&lt;b&gt;</b> closed.</p>');
  });
});
