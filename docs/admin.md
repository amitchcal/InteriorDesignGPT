# Platform admin (operator back-office)

A super-admin console at **`/admin`** for the platform operator to provision and
manage studios. It is the highest-privilege surface in the app — its routes read
and write **across every tenant**, bypassing the RLS that isolates studios — so
it is built deliberately narrow.

## Security model

- **Separate identity.** Admins are rows in `platform_admins` (0017), **not** an
  org role. A studio owner/designer/viewer can never reach admin through any
  tenant action.
- **Admission is out-of-band only.** There is no policy that lets anyone INSERT
  into `platform_admins`, so the app cannot grant admin. Regression-tested:
  even a platform admin is denied the insert via the API.
- **One gate, everywhere.** Every `/api/admin/*` route and the `/admin` page call
  `requirePlatformAdmin()` first. It checks `is_platform_admin()` in the
  **caller's** auth context (not the service role — can't be spoofed), and only
  then hands back a service-role client. A non-admin gets `403` from the API and
  a `404` from the page (its existence isn't confirmed).

## Seed the first admin (once, manually)

Find the user's id in `auth.users` by email, then, as the **service role** (or in
the Supabase SQL editor):

```sql
insert into platform_admins (user_id, note)
values ('<auth-users-uuid>', 'founder');
```

There is intentionally no self-serve path. To add more admins later, repeat this
out-of-band.

## What the console does (v1)

- **List** every studio: name, owner email, plan, member count, status.
- **Add a studio** for an **already-signed-up** account: enter the owner's email
  (no invite is sent), pick a plan → creates the org + owner membership and
  aligns the owner's subscription plan/quota. If no account matches, you're told
  to have them sign up first.
- **Change plan** — realigns the owner's subscription quota.
- **Suspend / activate** — sets `organizations.status`.

## Known follow-ups (deliberately not in v1)

- **Enforcing suspension.** `status='suspended'` is stored but **not yet
  enforced** — a suspended studio isn't blocked from the app. Enforcement is a
  separate change (a check in the proxy / tenant policies) so it can be designed
  and tested on its own.
- **Invite-by-email onboarding.** v1 attaches existing accounts only, to avoid
  sending mail. Inviting a brand-new owner via `auth.admin.inviteUserByEmail`
  (needs SMTP configured) is the natural next step.
- **Impersonation** ("log in as this studio") is intentionally omitted — high
  blast radius.
