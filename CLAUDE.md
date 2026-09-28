# M6 Motors — Vehicle Prep System
### Project brief for standalone build (hand this file to Claude Code)

This document describes a working prototype currently running as a Claude Artifact
(a single self-contained HTML page using Claude's built-in `db`/`user`/`assets`
capabilities). The goal of this project is to rebuild the same functionality as a
standalone web app with its own database and its own login system, so the
dealership fully owns its data instead of depending on Claude's infrastructure.

Give this whole file to Claude Code as the starting brief. It already knows enough
to scaffold the project; treat the "Open decisions" section at the end as things to
confirm with the business owner before or during the build.

---

## 1. Goal

A mobile-friendly web app used by dealership staff on their phones to track every
vehicle from arrival (stock) through sale (prep) to customer delivery, with a
role-based checklist of prep services and a monthly commission report for the
owner/manager.

**Users:** ~7 people — a salesperson/admin (the person who commissioned this
project), two Full Valet workers, a First Clean worker (plus the admin), a
Polish worker, and a manager who also does a "Decrome" service and has full
admin rights.

## 2. Recommended stack

- **Hosting:** Netlify (static frontend + serverless functions for anything that
  needs a service-role key, e.g. admin actions)
- **Database + Auth + File storage:** Supabase (Postgres database, built-in email
  login, row-level security, and Storage for vehicle photos) — chosen over Firebase
  because its relational model maps directly onto the schema below and its Auth +
  Storage + Postgres are one product with one dashboard. Firebase is an equally
  valid alternative if preferred; the schema translates directly to Firestore
  collections, one collection per table below.
- **Frontend:** plain HTML/CSS/JS (matches the current prototype) or a lightweight
  framework (e.g. React/Vite) if the developer prefers — no strong requirement
  either way, the current prototype is framework-free and works fine as a starting
  point structurally.

## 3. Screens / navigation

Three tabs, always visible:

1. **Stock** — vehicles that have arrived but are not yet sold.
2. **In prep** — vehicles that are sold and being prepared for delivery.
3. **Delivered** — history of completed deliveries, with a "reopen" action and a
   "delete records older than 30 days" housekeeping button.

Two admin-only screens, reached from header icons (visible only to admins):

4. **Team** — assign which staff accounts belong to each restricted service role.
5. **Monthly report** — pick a month, see vehicles completed per person per
   service, with a CSV export.

A floating "+" button whose action and label depend on the active tab:
"New stock" on the Stock tab, "Sold" on the In prep tab, hidden on Delivered.

## 4. Data model

### `vehicles` table (or `stock` + `sales` — see note below)

The prototype keeps stock and sold vehicles in two separate collections
(`stock` and `sales`) that share almost the same shape, because a stock vehicle
is deleted and a new sales record is created the moment it's marked sold (its
photo and any already-completed services carry over). A single `vehicles` table
with a `status` column (`'stock' | 'in_prep' | 'delivered'`) is a perfectly
reasonable, arguably simpler, relational alternative — just make sure "mark as
sold" and "deliver" become status transitions rather than document moves, and
that photo/service data survives the transition. Either design is fine; pick
whichever is more natural in the chosen database.

Fields (used by both stock and sold vehicles unless noted):

| Field | Type | Notes |
|---|---|---|
| `id` | string/uuid | primary key |
| `reg_imp` | string | import plate (e.g. UK-format), optional |
| `reg_ie` | string | Irish plate (IRL), optional — **at least one of the two plates is required** |
| `make` | string | |
| `model` | string | |
| `color` | string | free text, but the UI offers a fixed palette of common colours as quick-picks (White, Black, Grey, Silver, Blue, Red, Green, Beige, Brown, Orange, Yellow) |
| `notes` | string | free text |
| `photo_id` / `photo_url` | string | pointer to the stored photo (Supabase Storage path) |
| `services` | JSON or child table | see §5 below |
| `urgent` | boolean | **sold vehicles only** — priority flag |
| `day`, `time` | string | **sold vehicles only** — free-text expected delivery day/time (e.g. "Friday", "5PM") |
| `stock_status` | enum `in_stock`/`due_in` | **sold vehicles only** — whether the car is physically on the lot yet |
| `seller` | string | **sold vehicles only** — salesperson name |
| `vrt_nct` | string | **sold vehicles only** — free text (e.g. "done", "VRT pending", a date) |
| `mechanical_notes` | string | **sold vehicles only** — mechanical readiness / garage notes, free text |
| `estimate` | string | **sold vehicles only** — free text |
| `created_at`, `created_by` | timestamp, user id | |
| `delivered_at` | timestamp, nullable | **sold vehicles only** — set when marked delivered |
| `done_at` | timestamp, nullable | set when every selected service is done |

### 5. Services

Each vehicle has a subset of these four services selected at creation time,
each tracked independently:

| Key | Label | Restricted to a role? | Commission? |
|---|---|---|---|
| `first` | First Clean | Yes — `firstClean` role | No |
| `full` | Full Valet | Yes — `fullValet` role | **Yes — paid per vehicle** |
| `polish` | Polish | Yes — `polish` role | No |
| `decrome` | Decrome | No — anyone on staff can mark it | No |

Per-service state, per vehicle:

```json
{
  "state": "pending" | "doing" | "done",
  "by": "<user id, null until started>",
  "at": "<timestamp, null until done>"
}
```

Tapping a service cycles it: pending → doing → done → pending. Only members of
that service's role (or an admin) can change it; everyone else sees it read-only
with a small lock icon and a tooltip naming who's allowed.

**Denormalized fields for reporting:** alongside the nested `services` JSON, also
store `{service_key}_done_at` and `{service_key}_by` as flat top-level columns
each time a service is completed or reverted. This lets the monthly report run a
simple indexed range query (`WHERE full_done_at BETWEEN :start AND :end`) instead
of scanning nested JSON. This matters more in Firestore-style databases (no
querying inside maps) than in Postgres (which can query JSONB directly) — but
it's harmless and fast either way, so keep it for consistency.

**Carry-over on "mark as sold":** when a stock vehicle is converted to a sold
vehicle, copy its `services` object (including any already-completed states) into
the new sold record verbatim. Work finished while the car was still in stock (e.g.
a Full Valet done before the sale) must keep its original completion timestamp so
commission is credited to the correct month — never reset it to the conversion
date.

### `team` table (role assignments)

One row per role, each holding the list of user ids allowed to mark that role's
service:

| Field | Type |
|---|---|
| `role` | enum: `fullValet`, `firstClean`, `polish` |
| `member_ids` | array of user ids |

Only admins can edit this. The Team screen lets an admin search staff by name and
add/remove them per role.

### `users` (handled by Supabase Auth)

Each staff member gets a real login (email + password, or a magic link) via
Supabase Auth. Store on the user profile: display name, avatar (optional), and an
`is_admin` boolean (or a role/claim) — admins can always mark any service
regardless of team assignment, and are the only ones who see the Team and Monthly
report screens.

**Important — this is a genuine security boundary this time.** In the current
Claude-hosted prototype, the "only this role can mark this service" rule is
enforced only in the interface, not by the platform's access rules — it was a
soft, trust-based restriction appropriate for a small internal team, explicitly
flagged as such. In the standalone rebuild, enforce it for real with Postgres
row-level security policies (or equivalent), not just client-side checks, since
this now backs actual payroll data and a determined user could otherwise edit the
database directly.

## 6. Monthly report

For a selected month, for each of the three role-restricted services (plus an
informational count for Decrome), show a table of "team member → vehicles
completed", using `{service_key}_done_at` to filter by month and
`{service_key}_by` to group. Mark Full Valet's table as the one that pays
commission per vehicle. Provide a "Export CSV" button that flattens all the
tables into one file (`Service,Team member,Vehicles,Month`).

## 7. Photos

Each vehicle can have one photo, added via the phone camera or file picker,
shown as a small thumbnail on its card (next to the plate). Use Supabase Storage
(or Firebase Storage): upload the file, store the returned path/URL on the
vehicle row, and carry it over intact when a stock vehicle converts to sold.

## 8. Branding

- Logo: a black-background M6 Motors wordmark image (ask the person for the
  original file — the current prototype has it embedded as a small header badge,
  ~52×38px, rounded corners, `object-fit: cover`).
- All UI text in English (Irish English spellings are fine, e.g. "Colour").
- Plate display styled like a physical number plate: a small band on the left
  reading "IMP" (import plate) or "IRL" (Irish plate) in front of the registration
  in a condensed display font.

## 9. Nice-to-haves already in the prototype, worth keeping

- A demo/offline mode isn't needed here (that existed only to make the Claude
  Artifact usable before the org/database was set up) — the standalone app can
  assume a real login and real database from the start.
- "Only pending for me" toggle on the In prep tab — quick filter so a worker sees
  just the vehicles with a service they're allowed to complete.
- Search box filtering by plate, make, model, or salesperson.
- Optimistic-friendly UX: toasts for confirmations, an "Undo" option right after
  marking a vehicle delivered, double-tap-to-confirm on destructive actions
  (remove vehicle, delete old records).

## 10. Open decisions — confirm with the business owner before/while building

These were left flexible in the prototype and should be pinned down for the real
build:

1. **Mechanical readiness & Estimate fields** — currently free text. Does the
   owner want these as a fixed status list instead (e.g. "Ready / Waiting on
   part / In progress") for cleaner reporting?
2. **Salesperson field** — currently free text with autocomplete suggestions.
   Should it be a fixed list managed by an admin instead?
3. **Commission scope** — Full Valet is the only service currently marked as
   commission-eligible. Confirm whether Polish or others should also pay
   commission, and at what rate (this app only counts vehicles — payment
   calculation is presumably done separately).
4. **Mechanics' individual accounts** — the six mechanics currently aren't
   modeled as individual accounts (only Bart, the manager, records VRT/NCT and
   general mechanical status for the whole garage). Decide whether any of them
   need their own login and their own tracked checklist item, which would add
   more paid seats/accounts to the system.
5. **Service naming** — "Polish" vs the Portuguese "Polimento" — purely cosmetic,
   easy to change either way.

## 11. Suggested build order for Claude Code

1. Scaffold the repo, connect Supabase (schema for `vehicles`/`stock`, `team`,
   plus Supabase Auth), connect Netlify for hosting.
2. Build auth (login page, session handling, admin flag).
3. Port the Stock and In-prep list screens and the vehicle form (including
   photo upload) against the new database.
4. Port the service checklist with role-based restriction, enforced both in the
   UI and via row-level security.
5. Port "mark as sold" (stock → sales conversion, preserving service progress
   and photo).
6. Port Delivered tab, reopen, and the 30-day purge.
7. Port Team management screen (admin-only).
8. Port Monthly report + CSV export.
9. Polish: branding/logo, responsive pass on a real phone, deploy to Netlify.

## 12. Build status (2026-09-26)

Steps 1–8 are implemented; step 9 waits on the Supabase project, logo and deploy.
Setup instructions are in `README.md`.

- **No build step:** Node/git are not installed on the dev machine, so the app is
  plain ES modules in `public/` with supabase-js loaded from jsDelivr. Local preview:
  `python -m http.server 8080 --directory public`.
- **One `vehicles` table** with `status` (`stock`/`in_prep`/`delivered`); "mark sold"
  and "deliver" are status updates, so services, timestamps and photo carry over.
- **Services are flat columns** (`{key}_state`, `{key}_by`, `{key}_done_at`) plus
  `services text[]` for which ones are selected — no nested JSON.
- **Server-enforced rules:** the `vehicles_guard` trigger checks `can_mark()` on every
  service state change and sets who/when server-side. RLS restricts deletes, team
  edits and the report data to admins.
- **Report source is `service_completions`,** a log written by a trigger. It
  survives the 30-day purge, which would otherwise erase last month's commission data.
- Delivery day/time columns are `delivery_day` / `delivery_time`, not `day` / `time`.
- **Live at https://m6motors.netlify.app** — Netlify site id
  `529c7295-b563-4dd3-9600-b38d744c191c`. To redeploy,
  call the Netlify MCP `deploy-site` with that id and run the `npx @netlify/mcp`
  command it returns from `C:\M6system` (Node is installed; refresh PATH first).
  Bump `?v=` on `styles.css`/`app.js` in `index.html` before each deploy.
- Staff sign in with a **name**, not an email: the app maps "Ana Paula" to
  `ana.paula@m6.local` (`LOGIN_DOMAIN` in `public/config.js`). Accounts are created
  by hand in Supabase with Auto Confirm; there is no email reset.
- The report screen is a **weekly pay report** (presets This/Last week, This/Last
  month, custom dates; per-person car lists; print/PDF and two CSVs). No pay-rate
  maths and no "commission" labels, at the owner's request.
- **Database migrations** run by hand in the Supabase SQL Editor, in order:
  `schema.sql`, `002_push_notifications.sql`, `003_admin_only_stock_and_sales.sql`,
  `004_delivery_date.sql`, `005_loan_and_dent.sql`. Ship UI that needs a new column only after its migration ran.
- **Push notifications** (new stock only, creator excluded): `public/sw.js` +
  `push_subscriptions`; a trigger calls the Edge Function deployed as
  **`swift-responder`** (code in `supabase/functions/notify/`), which needs the
  `VAPID_PRIVATE_KEY` secret. The key file lives outside the repo in
  `%USERPROFILE%\M6-secrets` — never put it in the project folder (Netlify deploys
  upload the whole folder).
- **Admin-only:** adding vehicles and moving them in/out of stock (mark sold) —
  hidden in the UI and enforced by the `admin add vehicles` policy and the
  `vehicles_stock_guard` trigger.
- **Tabs are views, not the DB status** (`tabOf()` in app.js): Delivered →
  Loan (`hold='loan'`) → Dent (`hold='dent'`) → **In prep** = any selected service
  in `doing` → otherwise **Sold** (status `in_prep`, i.e. sold not delivered) or
  **Stock**. Tapping a service moves the car between tabs automatically.
- **Sold tab:** full cards grouped by `delivery_date` (Overdue / Today / Tomorrow /
  later / no date) with a printable daily job sheet (☐ per pending service). Dent
  and Loan tabs also print lists. Any staff can send a car to Loan/Dent
  (`005_loan_and_dent.sql`); Returned / Dent done clears the hold.
- Old free-text `delivery_day` is shown as a fallback when there's no `delivery_date`.
- Open decisions (§10) were left as in the prototype: free-text fields, Full Valet
  as the only commission service, the English "Polish" label, no mechanic accounts.
