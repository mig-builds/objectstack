---
'@objectstack/plugin-auth': patch
---

The actor and organization guards of `AuthManager` live in their own module, with no sign-in, session or membership outcome changed

Clause-②: no
Metadata-protocol: none

- `AuthManager` keeps every method with its name, signature and docblock. The bodies of eight private guards (`resolveActor`, `isPlatformAdminUserId`, `assertActorNotHeld`, `assertOrganizationDeletable`, `assertRemoveMemberPermitted`, `assertRevokeSessionIdentifiesRecord`, `assertAdminRevokeUserSessionIdentifiesRecord` and `resolveMembershipRole`) moved unedited to `packages/plugins/plugin-auth/src/auth-manager-actor-guards.ts`, together with the invitation role-cap read-fault error that only they throw. Each method now hands its body the members that body reads and calls it. Every refusal those guards answer keeps its code, status and message.
- Nothing to do for a consumer: the package's published declarations are byte-identical, and its entry exports the same names.
