# Auth email templates

Canonical copies of the emails Supabase sends for sign-up and sign-in. They live
here because Supabase stores templates only in its dashboard, where nothing
versions or tests them — the same "unversioned dashboard config" problem as the
sign-ups toggle. **This directory is the source of truth; the dashboard is a
deployment target.** Edit here, then paste.

| File | Supabase template | Sent when |
|---|---|---|
| `confirm-signup.html` | **Confirm signup** | A new user signs up |
| `magic-link.html` | **Magic Link** | An existing user signs in |

Install **both**. Which one a first-time `signInWithOtp` triggers depends on
project settings — if you only install one, the other path sends the unbranded
default.

## Install

> **Order matters.** The templates now show a sign-in code, and the login form
> now accepts one. Deploy the app change first (wait for Vercel to finish), then
> paste both templates straight away. The gap between the two is the only time
> an email and the page disagree about whether there's a code.
>
> If you pasted the **earlier** versions of these templates, they have no code
> in them — re-paste both. Until you do, the new code screen says "we sent a
> code" and the email doesn't contain one.

1. Supabase → **Authentication → Emails → Templates**.
2. Pick the template, set the **Subject**, paste the file's HTML into **Message**, save.

| Template | Subject |
|---|---|
| Confirm signup | `Confirm your Inkwell account` |
| Magic Link | `Your Inkwell sign-in link` |

Subjects are deliberate: plain, no exclamation marks, no "action required".

Also check **Authentication → Providers → Email**: the OTP length (leave it at
**6** — easy to type, and what the form's placeholder shows) and its expiry.

## Then test (the dashboard preview doesn't tell you what a mailbox does)

1. Request a **fresh** sign-up and sign-in email to a **Gmail** address and to an
   **iCloud** or **Outlook** address. Old emails keep the old template.
2. Open one → **Show original** (Gmail) and check **SPF / DKIM / DMARC = PASS**.
3. Note whether it landed in the inbox or spam. Re-test a different mailbox a day
   later; a mailbox remembers an earlier "Not spam" decision.
4. **Test the code path from a different device than you asked on** — request on
   a laptop, read the email on your phone, type the code into the laptop. This
   is the case the link can't handle, and the reason the code exists.
5. Test the link on the **same browser** you requested from, and confirm you land
   on `/feed`.
6. Do a real **new-account** sign-up at least once (a fresh address). A new
   account's code may verify under a different Supabase OTP type than an existing
   one's; the form tries both, but only a real run confirms it.

## Rules these files follow (enforced by `__tests__/email-templates.test.ts`)

- **No hardcoded domain.** The link is `{{ .ConfirmationURL }}`, which follows the
  Site URL in Supabase → Authentication → URL Configuration.
- **Only real Supabase variables.** `ConfirmationURL`, `Email`, `Token`,
  `TokenHash`, `SiteURL`, `RedirectTo`, `Data`, `NewEmail`, `OldEmail`. A typo
  renders as a blank link.
- **No images, scripts, or remote styles.** Clients block them and filters read
  remote content as a spam signal. The wordmark is text.
- **Small.** Gmail clips messages past ~102 KB.

## What it can't fix

The link goes to `<project>.supabase.co/auth/v1/verify?...` and then redirects to
the site. That host doesn't match the From domain, which filters notice. Only
Supabase's paid **custom auth domain** changes it. Try the content and DMARC
changes first.

## The sign-in code

Both templates show a one-time code under the button (`{{ .Token }}`), because
the emailed link only works in the browser that requested it. That broke sign-up
for anyone who asked on one device and opened the email on another — and for
people arriving through Instagram's in-app browser. A code is verified on the
server, so it works from anywhere.

The form (`components/AuthForm.tsx`, via `lib/auth-flow.ts`) has the matching code
field. **The two must ship together**: `__tests__/email-templates.test.ts` fails
if an email shows a code while the form can't accept one, or the reverse. That
mismatch — a code box with no code in the email — is why the first version of the
code entry was removed (DECISIONS.md).
