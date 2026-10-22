---
'@objectstack/plugin-email': patch
'@objectstack/service-messaging': patch
---

fix(plugin-email, service-messaging)!: retire the render exports that take a template body with no save moment (`renderTemplate`, `renderNotification`, `interpolate`)

The hole-placement rule is judged where a template is saved or registered: the `sys_notification_template` save hooks, and the authoring rule for email templates. Three exports took a template body inline and rendered it at once, with no save moment, so the rule could not see them. They leave the two packages' published entries. Nothing in this repository imported them from either entry. The renderers stay inside the packages: the mail service and the email and sms channels still render every stored template through them, unchanged.

Clause-②: no (narrowing)
Metadata-protocol: none

<!-- adr-0087: not-required (runtime-export-retired @objectstack/plugin-email#renderTemplate, @objectstack/service-messaging#renderNotification, @objectstack/service-messaging#interpolate) Three runtime functions leave two published package entries; no key of any metadata schema, no object definition and no stored shape is added, removed, renamed or re-shaped, so there is nothing for `objectstack migrate meta` to rewrite and no tombstone. A TypeScript consumer meets the break at its own import, and the lines below name the door to use instead. -->

**BREAKING** (three runtime exports are removed). It ships as `patch` because the metadata protocol does not move. There is no staged window.

- FROM `renderTemplate` imported from `@objectstack/plugin-email` TO a template saved or registered as an `email_template` and rendered by name through the mail service: `renderTemplate({ template, data, locale })` on the `email` service (render only) or `sendTemplate` (render and send).
- FROM `renderNotification` imported from `@objectstack/service-messaging` TO a `sys_notification_template` row for the topic, channel and locale, which the delivering channel renders when the notification is emitted.
- FROM `interpolate` imported from `@objectstack/service-messaging` TO the subject or plain-text body of a `sys_notification_template` row, rendered the same way by the delivering channel.

Unchanged: `requireVars` and `htmlToText` in `@objectstack/plugin-email`, and the mail service's `setTemplateLoader`; `NotificationTemplateStore`, `TEMPLATE_OBJECT`, `DEFAULT_LOCALE` and the template types in `@objectstack/service-messaging`; and how every stored template renders.
