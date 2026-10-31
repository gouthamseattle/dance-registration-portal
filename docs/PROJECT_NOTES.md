# Project notes: decisions, links, setup and to-do

Read this with `CLAUDE.md` at the start of every session. `CLAUDE.md` says how the
code works; this file says **why** things are the way they are, where things live
outside the code, and what is still open. Keep it current: update it in the same
PR as any change that adds a decision, a link or a to-do.

## Links

| What | Where |
|---|---|
| Live site (students) | https://dance-registration-portal-production.up.railway.app |
| Admin portal | https://dance-registration-portal-production.up.railway.app/admin (also installed on the owner's iPhone as the "GouMo Admin" home-screen app) |
| Lite admin for helpers (approved emails only) | https://dance-registration-portal-production.up.railway.app/admin-lite (installs as "GouMo Admin Lite") |
| Lite admin design mockup (approved) | https://claude.ai/artifact/TYfQ9yje3k3wcwXz3XTz5K |
| Student "My classes" page | https://dance-registration-portal-production.up.railway.app/my |
| Privacy page (needed by Google) | https://dance-registration-portal-production.up.railway.app/privacy |
| Code | https://github.com/gouthamseattle/dance-registration-portal (currently public) |
| Hosting | Railway, Hobby (free-tier) plan; pushing to `main` deploys |
| Student-site design mockup (approved) | https://claude.ai/artifact/78KRwxMGmMVV5zsRJ6x7Wj |
| Admin design mockup (approved) | https://claude.ai/artifact/DYwNsw2zEddnwLra5CVEmQ |
| Instagram | https://instagram.com/goumo_dancechronicles |

## About GouMo (for copy and design)

- GouMo Dance Chronicles, Seattle. Founders of Dreamers Dance Crew (DDC); hosts of the
  annual DDC × GouMo Dance Competition & Showcase.
- Goutham: head instructor and choreographer. Monica: co-founder and instructor.
  Rudie (7+ years professional) and Supriya (3+ years) also teach.
- Styles: Locking, House, Hip-hop, plus choreography. Students are mostly from Seattle's
  Indian community; links are shared on WhatsApp, so the student side is phone-first.
- Tagline: "Train like you mean it." Line: "Led by a professional choreographer and
  dancers with multiple championships across India, now teaching in Seattle."

## Brand rules

- "Night Studio" look: dark background (#0B0B0D), GouMo yellow accent #FFD60A,
  Anton (headings) and Inter (body). Tokens live in `public/css/site.css`.
- The GouMo logo is the centrepiece of the home page; no big caption or photo hero.
- Copy must never sound harsh, and must never knock Bollywood or other dance classes.

## Decisions (and why)

- **Payments are confirmed by hand.** Automatic Venmo/Zelle detection was explored and
  dropped: the owners freelance, so no PayPal/Venmo business account; the Venmo
  account's Gmail is different from the GouMo Gmail; reading forwarded emails felt too
  complicated. Students see "We'll verify your payment and then send a confirmation email."
- **A registration is saved only when the student taps "I've sent the payment"**, so
  abandoned checkouts leave no records.
- **Email goes through the Gmail API over HTTPS**, because Railway blocks SMTP below the
  Pro plan and $20/month for Pro is too much for how rarely the portal is used.
- **Students sign in with email only** (no password or code). An emailed 6-digit code was
  offered and declined for now. The student page never shows admin notes or payment details.
- **Students are hidden, never deleted** (`archived_at`), so payment history stays intact.
- **Only the admin can cancel registrations.** Cancelling a paid one offers the spot to
  the waitlist automatically, in order, held for the "waitlist hold" time (default 24h).
- **"Classes taken" = paid registrations.** No roll call / attendance taking. Old
  attendance records from before Oct 2026 show on profiles as "Attended (old records)".
- **Crew members' crew practices are counted separately** from regular classes.
- **Crew practice can have several dates** at a fee per practice; students pick 1, 2 or all dates and the server works out the amount. No spot limit is needed for crew practice (set a large capacity).
- **Crew-only classes are hidden from the public home page.** Crew members register through the `/crew` link, shared only in the crew WhatsApp group; it opens the register page listing only crew-only classes.
- **The student "My classes" page stays minimal:** totals plus a list of class names
  and statuses. The admin profile has the full detail.
- **Levels are separate classes**; classes taken together are sold as **combos**.
- **gouthamseattle@gmail.com is the owner's test account** (mark it "test account" in
  admin): its registrations don't count in numbers, and it can register for full,
  closed or crew-only classes.

## Setup outside the code

- **Google Cloud project "GouMo Email"** (signed in with the GouMo Gmail): Gmail API
  enabled; Google Auth Platform app "GouMo" **published to production** (in "Testing" the
  sign-in expires after 7 days); OAuth client of type Web application with redirect URI
  `https://developers.google.com/oauthplayground`. The refresh token was made in the
  OAuth Playground with scope `https://www.googleapis.com/auth/gmail.send`.
  The Client ID, secret and refresh token are stored only in Railway variables
  (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`). Never put them in the code.
- **Admin → Settings → Test email** shows which email method is active and the exact
  error if sending fails.

## Payments: Venmo only (Oct 2026)

- Zelle is switched off with Admin → Settings → "Accept Zelle payments" (setting
  `zelle_enabled`, off by default). Checkout then goes straight to Venmo. The Zelle code stays,
  so it can be switched back on without a developer. Past Zelle payments keep their label.
- The Venmo username comes from Settings on every checkout; changing it there is enough.
  After a change, check both Venmo accounts for a few days before accepting pending payments.
- Checkout (approved mockup https://claude.ai/artifact/1L1Xer2J16pou6G3RmZGuG): payment
  screen → "Did you send the payment?" sheet (Yes, I've paid / Not yet) → "You're all done!"
  screen that tells the student they've done their part. "Your spot is confirmed once we
  receive your payment" sits under the button. The old PayPal "You're in!" screen is gone.

## Instructor bios (home page)

- Cards show role, years and style tags (styles each person *teaches*): Goutham Locking,
  Hip-hop, House, Choreography; Monica Locking, Choreography; Rudie and Supriya Choreography.
- Tapping a card opens a bio sheet with highlights and "Classes with <name>" (open classes whose
  `instructor` field contains that name). Bio text lives in `INSTRUCTORS` in `public/js/home.js`.
- Sources: Goutham's and Monica's bio posters (Documents/Posters/goumo-posters/assets/instructors),
  Rudie's and Supriya's text from the owner. Monica is "Founder · Locking specialist"; no names
  of the lockers she trained with. No "teaching vibe" lines.
- Mockup (approved): https://claude.ai/artifact/S3QjJsmgqdAtbmThGS39b4

## Lite admin for helpers (`/admin-lite`)

- Replaces the parked payment checker. The owner approves emails in Admin → Settings →
  Other admins; approving (or "Resend invite") emails them the link, first sign-in and
  iPhone home-screen steps, even when student confirmation emails are off.
- Each helper sets their own password on first sign-in. Accepted risk: someone who knows an
  approved email could set it first, so helpers sign in soon after approval. Reset = remove
  and approve again (a fresh invite goes out).
- Helpers see classes with registration open, or closed in the last 7 days
  (`courses.registration_closed_at`), crew practices included, test registrations hidden.
  They can accept, cancel ("Are you sure?" only, no reason) and download a class CSV.
  Accept/cancel behave exactly like the full admin; only the owner can undo a cancel.
  `registrations.handled_by` records who acted.
- The invite email uses the black/yellow GouMo look; student emails are still the older
  pink design (possible later update).

## How we work

- The owner is a data engineer, not a front-end developer: explain web things simply,
  and keep token cost low.
- **New features: design first, then a mockup, and build only after the owner approves.**
- Every change: a branch, a PR, GitHub Actions runs the smoke tests, **the owner merges
  on GitHub**, Railway deploys `main`.
- `npm install` doesn't work in Claude's cloud sandbox, so screens are checked with a
  small mock server plus Playwright and sample data; the real server is tested in CI.
- `gh pr create` is blocked there (GraphQL); open PRs with `gh api repos/.../pulls`.
- Pages are served with `Cache-Control: no-cache`; scripts and styles use `?v=` numbers.
  Phones that cached an old version before that change may need one hard refresh.

## To-do / parked

- [ ] Set `ADMIN_PASSWORD` and `SESSION_SECRET` in Railway (deferred by the owner).
- [ ] Consider making the GitHub repo private.
- [ ] Remove unused npm packages, debug endpoints and PayPal leftovers.
- [ ] Open each older class in the new class form and save it once (fills dates, instructor, fees).
- [ ] Run Admin → Students → Data check on live data and fix what it finds.
- [ ] Ideas, not yet requested: emailed sign-in code for students, class reminder emails,
      a "you joined the waitlist" email.
