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

1. Supabase → **Authentication → Emails → Templates**.
2. Pick the template, set the **Subject**, paste the file's HTML into **Message**, save.

| Template | Subject |
|---|---|
| Confirm signup | `Confirm your Inkwell account` |
| Magic Link | `Your Inkwell sign-in link` |

Subjects are deliberate: plain, no exclamation marks, no "action required".

## Then test (the dashboard preview doesn't tell you what a mailbox does)

1. Request a **fresh** sign-up and sign-in email to a **Gmail** address and to an
   **iCloud** or **Outlook** address. Old emails keep the old template.
2. Open one → **Show original** (Gmail) and check **SPF / DKIM / DMARC = PASS**.
3. Note whether it landed in the inbox or spam. Re-test a different mailbox a day
   later; a mailbox remembers an earlier "Not spam" decision.
4. Open the link on the **same device and browser** you requested it from, and
   confirm you land on `/feed`.

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

## Adding the sign-in code later

The emails deliberately contain **no code** today, because the login form has
nowhere to type one — that mismatch is exactly why the original code box was
removed (DECISIONS.md). When `components/AuthForm.tsx` gains a code field
(`verifyOtp`; see the "OTP code in email" item in BACKLOG.md), add this inside
the card of **both** templates, just below the button's row:

```html
<tr>
  <td style="padding:0 36px 16px 36px;">
    <p class="t-muted" style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;color:#6f6a62;">
      Or enter this code in the app:
      <strong class="t-ink" style="font-size:18px;letter-spacing:0.18em;color:#17130f;">{{ .Token }}</strong>
    </p>
  </td>
</tr>
```

`__tests__/email-templates.test.ts` fails if the email shows a code while the
form can't accept one, or the form accepts one while the email has none, so the
two changes have to land together. The "same device and browser" paragraph can
be softened at the same time — the code is what makes cross-device sign-in work.
