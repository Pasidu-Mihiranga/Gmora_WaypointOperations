# Round 2 — final verification and completion plan

Prepared **2026-10-04 (Asia/Colombo)** against branch `audit/dispatcher-data-planning-ui`.

> **The Round 2 submission closes today, Sunday 4 October 2026 at 11:59 PM Sri Lanka time** (booklet p.13).
> Code pushed after the deadline is not considered. Phase 0 and Phase 11 are therefore the only
> unconditional blockers: the build is substantially complete, but it is **not submitted**. Everything
> else in this plan is improvement on top of a working system.

Authority: [Challenge Booklet](./Challenge%20Booklet.pdf) pp. 11–13 · [AGENTS.md](../AGENTS.md) ·
[CLAUDE.md](../CLAUDE.md) · [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) ·
[WORK_LOG.md](./WORK_LOG.md). Repository rules are **not** restated here; AGENTS.md §2 (ask first),
§5 (file structure) and §6 (curl verification) continue to apply to every task below.

This plan supersedes the status columns of [ROUND2_REQUIREMENTS_AUDIT.md](./ROUND2_REQUIREMENTS_AUDIT.md)
(2026-10-03), which predates the loader, driver, sync, receipt, exceptions, live-operations, forecast
and store-manager work and still describes those modules as placeholders. Its requirement list and
booklet reading remain valid.

Priorities: **[P0]** blocks submission · **[P1]** major scoring or business-flow issue ·
**[P2]** important polish · **[P3]** optional.

---

## Executive position

What is actually built and verified today (evidence: 174 API tests, 170 web tests, `scripts/smoke.sh`
green on a clean throwaway stack, real Playwright runs this session):

- Four role workspaces with real screens and no placeholder routes remaining.
- All twelve constraint rules exist as independent classes under `planning/domain/rules/`.
- Manual planning, snapshot freeze, deferral with reasons, publication and versioned manifests.
- Loader manifest/shortfall, driver trips/POD/offline outbox, store receipt/dispute, dispatcher
  exceptions and live operations.
- A synthetic product catalog with order lines, sized from real per-unit averages.
- A cross-role lifecycle E2E test exists (`tests/e2e/lifecycle.spec.ts`).

What is missing is almost entirely **submission packaging, not product**:

| Blocker | State |
|---|---|
| Work committed and pushed | ~40 modified + 9 untracked files, on a non-default branch |
| Repository name `TeamName_SolutionName` | Remote is `TechTrithalon` |
| Deployed public URL + 4 credentials | Not provisioned |
| Numbered judge walkthrough in README | Absent |
| AI tool disclosure in `docs/` | Absent |
| Architecture diagram + data model in `docs/` | `docs/architecture/` holds only `.gitkeep` |
| Demo video (5–8 min) | Not recorded |

**If only one thing is done today, it is Phase 0 followed by Phase 11.**

---

## Phase 0 — Submission blockers (do first)

**Goal.** Make the existing, working system submittable within the deadline.

**Current state.** The build is healthy and verified locally. None of the five booklet deliverables
(deployed URL, correctly named repo, README walkthrough, docs/AI disclosure, video) are complete.

**Gaps.**
- The session's work is uncommitted and unpushed; the default branch does not contain it.
- The GitHub monorepo name does not match the booklet's `TeamName_SolutionName` form.
- No deployment exists, so there is no public URL or live credentials to submit.

**Tasks.**
- [ ] **[P0]** Review `git status` for secrets, `.env` and `dataset/` (AGENTS.md §9), then commit the
      outstanding store-manager, catalog, forecast and smoke-script work in reviewable commits.
- [ ] **[P0]** Merge to the default branch and push. Owner approval required before any push
      (AGENTS.md §2).
- [ ] **[P0]** Rename the GitHub repository to the booklet form, e.g.
      `TechTrithalon_WaypointOperations`, and update the clone URL in the README.
- [ ] **[P0]** Deploy the stack and verify the four seeded logins against the public URL. Set
      `COOKIE_SECURE=true`, a real `WEB_ORIGINS`, `VITE_API_BASE_URL`, and leave `DEMO_CLOCK_INSTANT`
      **empty** (README already warns against a fixed clock in deployment).
- [ ] **[P0]** Confirm the deployed `DEMO_OPERATING_DATE` is still an operating day in the calendar, or
      the walkthrough dies at ordering with `422 NO_OPERATING_DAY`.
- [ ] **[P0]** Record and upload the unlisted 5–8 minute demo video: four roles completing the
      walkthrough, then code and architecture.
- [ ] **[P0]** Submit repository link, deployed URL, four credentials and the video link through the
      form.

**Acceptance criteria.** A judge opens the public URL, signs in as each of the four roles, and follows
the README walkthrough end to end without touching the database.

---

## Phase 1 — Shared data and demonstration seed

**Goal.** A clean `docker compose up` produces one coherent, deterministic delivery day.

**Current state.** `ReferenceDataSeeder` imports five General Data CSVs idempotently and atomically
(120 outlets, 60 vehicles, 910 calendar days, 12 districts, 9 allowances), rolling back on a count
mismatch. `DemoDaySeeder` seeds 85 confirmed Peliyagoda orders and 38 availability rows.
`scripts/seed-operating-day.py` can enrich an existing day through real API calls
(`--enrich-existing`, `--verify-only`, `--seed-offline-arrival`), leaving an open loader shortfall, an
active driver trip, a store delivery awaiting receipt and an open dispatcher exception. A synthetic
catalog (`V20261004_2200__product_catalog.sql`) adds 30 items in 12 groups with no prices.

**Gaps.**
- The demo-day orders come from `dataset/data/Test Data/task2b_peak_day_*.csv` — **Task 2b inputs that
  belong to the Datathon round**. Round 2 demonstration data should not depend on a future round's
  files, and a judge who mounts only General Data gets an empty operating day.
- The advisory forecast depends on `Training Data/deliveries_train.csv` (Datathon). It degrades to an
  honest unavailable state, so this is a dependency to disclose rather than a defect.
- Catalog item sizing is derived from imported order averages, so without demo orders the Place Order
  screen silently falls back to unit entry. Correct behaviour, but it chains onto the same files.
- The enrichment script is a separate manual step; `docker compose up` alone does not produce the
  loading/delivery/receipt/exception states the walkthrough needs.

**Tasks.**
- [ ] **[P1]** Add a Round 2 demo-day seed that does not read `Test Data/`: generate the day's orders
      from outlets, calendar and vehicles (all General Data) with a fixed seed so the result is
      deterministic. Keep the existing importer as an optional override.
- [ ] **[P1]** Fold the `--enrich-existing` outcome into startup seeding (behind `DEMO_SEED_ON_STARTUP`)
      so one command yields the full demonstrable day.
- [ ] **[P2]** Document, in the README data section, exactly which screens degrade when `Training Data/`
      is absent (Forecast only) and that this is deliberate.
- [ ] **[P2]** State in the catalog migration header and the README that catalog items are
      demo/enrichment data and carry no prices.

**DB/API considerations.** New seed work belongs in `ordering/infrastructure` beside `DemoDaySeeder`;
no schema change is needed. Do not fabricate vehicle capacities, windows, fuel quotas or travel times —
those stay competition-sourced (see the provenance matrix).

**Acceptance criteria.** From an empty volume with only General Data mounted, `docker compose up`
yields a day on which every walkthrough step below is performable, and a second run changes nothing.

---

## Phase 2 — Store Manager

**Goal.** Confirm the rebuilt store experience is complete and faithful.

**Current state.** Rebuilt from Figma this session: Home (4 KPIs, recent orders, arrival/next-delivery,
open issue), Orders (server-grouped chips, search, paging), Order detail (timeline, items), Place Order
(catalog, basket, server-sized totals, review, confirmation), Deliveries, Confirm Receipt, Report
Issue, Issues, Profile, Notifications, Deferral notice. Backed by `/store/home`, `/store/order-board`,
`/store/catalog`, `/store/order-preview`, `/store/orders/{id}/lines`, `/store/notifications` and the
existing receipt endpoints. Covered by `ReceiptIT`, `OrderCommandIT` and web tests; `store-order.spec.ts`
passes against the running stack.

**Gaps.**
- Not built for want of a data source: Rs prices and totals, "this month spend", editable phone number,
  help & support, contact dispatcher, notification read state. All are deliberate omissions.
- One active order per outlet/day/temperature means a judge on the seeded day may meet `409
  DUPLICATE_TEMP_ORDER` before seeing a successful submit.

**Tasks.**
- [ ] **[P1]** Ensure the walkthrough's seeded day leaves at least one temperature free for the store
      outlet, so step 1 of the judge walkthrough actually creates an order.
- [ ] **[P2]** Verify Home, Orders and Place Order at phone width; the store role currently renders the
      desktop shell.
- [ ] **[P3]** List the deliberate omissions above in the README's design-departures section.

**Acceptance criteria.** A judge places an order from the catalog, sees it in Orders as Submitted, and
later confirms its receipt — with no manual database edit between steps.

---

## Phase 3 — Dispatcher

**Goal.** Confirm every dispatcher surface is real and free of internal language.

**Current state.** Home, Orders, Planning (five real step components), Live Operations, Forecast,
Capacity decision, Fleet, Exceptions, Deferred Orders, Settings. Forecast was corrected this session
(projection dates, history-age flag, configurable thresholds, API-supplied time zone).

**Gaps.**
- `DispatcherProfilePage` renders user-visible text reading "become available with Phases 7–11".
  CLAUDE.md forbids internal phase numbers in anything an outside reader sees.
- `apps/web/src/features/planning/PlanningStages.tsx` exports two functions. `PlanningStageTabs` is
  live (used by `PlanningConfirmedOrdersPage`), but `PlanningPendingStage` in the same file is
  **unused dead code** carrying "Phase 7 supplies…", "Phase 10 supplies…", "Phase 11 supplies…"
  panels. It survives from before the five real step components existed.
- `roles.ts` page descriptions still carry `phase:` metadata and the Planning entry says "later steps
  arrive in Phases 5–11"; `PlaceholderPage` interpolates `page.phase` into a user-facing sentence.
  No route resolves to `PlaceholderPage` any more, so this is latent rather than live.

**Tasks.**
- [ ] **[P1]** Replace the phase wording in `DispatcherProfilePage` with a plain capability statement.
- [ ] **[P1]** Delete the unused `PlanningPendingStage` function from `PlanningStages.tsx`, keeping
      `PlanningStageTabs`. Confirm no import first (verified today: only `PlanningStageTabs` is used).
- [ ] **[P2]** Remove the `phase` field from `RolePage`, or stop rendering it in `PlaceholderPage`, and
      reword the Planning description.
- [ ] **[P2]** Check Exceptions and Live Operations at tablet width.

**Acceptance criteria.** No screen a judge can reach mentions a phase number, and no dead planning
component remains in the live planning file.

---

## Phase 4 — Planning engine

**Goal.** Confirm the 20% criterion is defensible.

**Current state.** Twelve independent rules exist — `SameBrandDistrictRule`,
`TemperatureCompatibilityRule`, `VehicleAccessRule`, `DepotAffinityRule`, `WholeOrderRule`,
`TripCapacityRule`, `TripCountRule`, `DeliveryWindowRule`, `FuelQuotaRule`, `OperatingDayRule`,
`TimeBudgetRule`, `VehicleAvailabilityRule` — composed by `PlanValidator` over frozen
`PlanConstraintParams`, producing `ConstraintViolation`/`PlanValidationReport`. Snapshots freeze orders,
vehicle capability and fuel state, windows, access, travel, allowances, calendar and rule parameters,
with a content-derived reference version. Deferral requires a reason code and carries forward.
Publication is validated and versioned.

**Gaps.**
- **There is no automatic or assisted allocation.** Booklet p.12 explicitly permits "manual decisions
  with validation", so the build is compliant — but on a 20% criterion, a planner that only validates
  human choices is the weakest scoring surface in the system. No greedy allocator exists in Spring and
  `apps/intelligence` is a `/health` stub; `planning/` and `forecasting/` Python packages are empty.
- Explainability beyond violation text (ranked fixes, alternatives, dry-run preview) is not built.

**Tasks.**
- [ ] **[P1]** Add an **assisted** first-fit allocator in Spring that proposes an allocation for the
      frozen snapshot, then runs the existing validator over its own output and shows both the proposal
      and any violations. Reuse `PlanValidator` — never a second copy of the rules (AGENTS.md §4: the
      validator is independent of the planner).
- [ ] **[P2]** Surface the deferral set the allocator produces when demand exceeds capacity, which is
      the behaviour the booklet names explicitly.
- [ ] **[P3]** Python CP-SAT, alternatives and dry-run preview remain Part B work; do not start them
      before the submission is secured.

**Acceptance criteria.** With one action the dispatcher gets a complete proposed allocation plus a
validation report, and may still override any assignment manually.

---

## Phase 5 — Loader

**Goal.** Confirm the published manifest and shortfall path work on a phone.

**Current state.** 15 Java classes in `loading/`; loader home, trip, order loading, shortfall and issues
screens; `TopNav` shell; `loader.spec.ts` e2e. Departure is blocked by `DepartedTripGuard` /
`TripExecutionGuard` until loading completes.

**Gaps.** Figma's loader frames are tablet-first (834 px) with phone twins; judges assess the loader on
phone-sized screens. Device-class switching exists (`lib/device.ts`, breakpoints 767/1023/1366) but the
phone rendering of each loader screen is not evidenced in this session.

**Tasks.**
- [ ] **[P1]** Walk loader home → trip → order loading → report shortfall → ready for handover at
      390×844 and fix anything unusable.
- [ ] **[P2]** Confirm a recorded shortfall reaches the dispatcher Exceptions queue and blocks departure.

**Acceptance criteria.** The whole loader flow is operable on a phone, and a shortfall is visible to the
dispatcher without a reload trick.

---

## Phase 6 — Driver

**Goal.** Confirm trips, POD and outcomes on a phone.

**Current state.** 22 Java classes in `delivery/`; driver home, trip overview, route, stop details,
delivery confirmation, issue, offline sync and reconcile screens; `driver.spec.ts` and
`driver-offline.spec.ts`. POD goes to Cloudinary per ADR 0001. 15 web tests for driver screens pass
individually.

**Gaps.**
- `driver.test.tsx` fails intermittently in full-suite runs (a different test each time) and passes in
  isolation. Pre-existing and unrelated to this session's work, but it is the only flake in the suite.
- `apps/mobile/` contains only `.gitkeep` files. Native is explicitly optional (booklet p.11).

**Tasks.**
- [ ] **[P2]** Diagnose the `driver.test.tsx` flake — most likely a shared timer/fetch stub leaking
      between tests — so the suite is green on a judge's machine.
- [ ] **[P3]** Leave `apps/mobile/` empty; do not start Expo work before submission.

**Acceptance criteria.** The driver completes a stop with proof on a phone viewport, and the full web
suite passes twice consecutively.

---

## Phase 7 — Cross-role integration

**Goal.** Prove one order travels the whole chain.

**Current state.** `tests/e2e/lifecycle.spec.ts` already drives dispatcher → loader → driver → store →
dispatcher, including a disputed delivery the dispatcher resolves. The store-order e2e passes against
the live stack.

**Gaps.** The lifecycle test is **skipped unless `MANUAL_PLANNING_FIXTURE=synthetic`**, so it does not
run in a normal verification pass and its guarantee is invisible to a judge reading CI.

**Tasks.**
- [ ] **[P1]** Run the lifecycle spec once against the deployment candidate and record the result in a
      verification doc.
- [ ] **[P1]** Make the judge walkthrough mirror this exact sequence, so the README and the test prove
      the same thing.
- [ ] **[P2]** If CI can host the synthetic fixture, unskip it there.

**Acceptance criteria.** One order reference is traceable across all four roles in a single documented
run.

---

## Phase 8 — Offline and recovery

**Goal.** Confirm the 10% degradation criterion.

**Current state.** `packages/field-core` holds the shared outbox; all driver writes go through
`POST /api/v1/driver/sync`; `sync/` has 11 Java classes with idempotency and conflict storage;
`SyncIT` covers "the driver's record wins when the dispatcher changed the trip while the phone was
off" and stored conflicts; `scripts/seed-operating-day.py --seed-offline-arrival` demonstrates a
deduplicated retry; Offline Sync and Sync Reconciled screens exist.

**Gaps.** None identified. This is one of the stronger areas.

**Tasks.**
- [ ] **[P2]** Rehearse the offline segment for the video: go offline, record an arrival and an outcome,
      reconnect, show the reconciled screen and the retained conflict.
- [ ] **[P2]** Confirm the service worker and web manifest in `apps/web/public/` are served by the
      deployment, not only locally.

**Acceptance criteria.** The video shows a genuine offline capture surviving a reconnect, with the
conflict visible as evidence.

---

## Phase 9 — Figma fidelity and responsiveness

**Goal.** Protect the 10% design-fidelity criterion without chasing pixels.

**Current state.** Store Manager was rebuilt frame by frame this session; forecast and capacity-decision
screens were restyled to their frames. Dispatcher, loader and driver were built against their frames in
earlier phases. Layout switches on device class rather than a single breakpoint.

**Gaps.**
- Deliberate departures exist and are currently recorded only in `WORK_LOG.md`: no product prices or
  spend totals, no "± 10 min" ETA band, no over-capacity badges on the forecast, no contact-dispatcher
  channel, no editable profile. The booklet requires significant departures in the **README**.
- Phone-width evidence is missing for loader and driver (Phases 5–6).

**Tasks.**
- [ ] **[P0]** Write the "Significant departures from the Designathon submission" README section,
      drawing on the WORK_LOG entries. Each departure: what the design showed, what ships, and why
      (nearly always "the dataset carries no such field").
- [ ] **[P2]** Capture one screenshot per role at its judged width for the verification record.

**Acceptance criteria.** A judge comparing prototype and build finds every difference already
explained in the README.

---

## Phase 10 — Optional high-value enhancements

Only after Phase 0 and Phase 11 are complete.

- [ ] **[P3]** LLM explanation of constraint violations and deferrals: backend facts → advisory text →
      human decision → normal API → authoritative validation. It must never mutate operational truth or
      replace a rule (AGENTS.md §4).
- [ ] **[P3]** Dispatcher exception summarisation for the Live Operations board.
- [ ] **[P3]** Ranked suggested fixes with a dry-run preview (Part B step 11).
- [ ] **[P3]** Expo driver app reusing `field-core` (Part B step 12).

None of these block submission; none should start today.

---

## Phase 11 — Repository and submission cleanup

**Goal.** The repository a judge clones is clean, honest and complete.

**Tasks.**
- [ ] **[P0]** Confirm `dataset/`, `.env` and `apps/intelligence/.venv` are ignored and absent from
      history; `.env.example` carries placeholders only.
- [ ] **[P0]** Add `docs/AI_DISCLOSURE.md`: which work was AI-assisted, which was not, which tools, and
      how human verification was applied. The booklet names this as a deliverable; today it exists only
      as a design-stage paragraph inside `waypoint-design-documentation.md`.
- [ ] **[P0]** Populate `docs/architecture/` — it currently holds only `.gitkeep` — with a current
      architecture diagram and the data model. `docs/diagrams/` holds Designathon diagrams that can be adapted, but
      they must reflect what shipped.
- [ ] **[P0]** Add the numbered four-role judge walkthrough to the README.
- [ ] **[P1]** Verify `docker compose up` from a clean clone with only `.env.example` copied.
- [ ] **[P2]** Review `VITE_SEED_*_PASSWORD`: these put seeded passwords in the browser bundle for the
      demo login buttons. Acceptable for seeded judge accounts, but confirm they are the seeded
      credentials only and say so in the README.
- [ ] **[P2]** Decide the fate of the empty `notification/` and `intelligence/` Java module folders —
      keep as declared structure or remove, but do not leave them unexplained.
- [ ] **[P3]** Remove `docs/WAYPOINT_PHASE2_ANALYSIS.md`'s stale Next.js/Prisma proposal, or mark it
      historical, so no judge mistakes it for the architecture.

**Acceptance criteria.** A fresh clone plus `.env` starts, seeds and serves the walkthrough, and every
booklet-required document is present in `docs/`.

---

## Phase 12 — Final verification and demo readiness

**Tasks.**
- [ ] **[P0]** `./gradlew test` (174 tests), `pnpm --dir apps/web test` (170 tests),
      `pnpm --dir apps/web build`, `./scripts/smoke.sh` on a clean throwaway stack.
- [ ] **[P0]** Four real logins against the **deployed** URL, not localhost.
- [ ] **[P1]** One rehearsed walkthrough run end to end, timed against the 5–8 minute video budget.
- [ ] **[P2]** Record the final evidence in a short verification doc, one table row per check
      (CLAUDE.md cost rules).

---

## Matrices

### Round 2 scoring coverage

| Criterion | Weight | Current evidence | Gap | Planned fix |
|---|---:|---|---|---|
| Engineering quality and architecture | 25% | Compose stack, Flyway, Testcontainers, generated OpenAPI client, RBAC, 174 API tests | `docs/architecture/` holds only `.gitkeep`; dead `PlanningPendingStage` | Phase 11, Phase 3 |
| Functional completeness, four roles | 20% | All four workspaces real; lifecycle E2E exists | Lifecycle test skipped by default; loader/driver phone evidence missing | Phase 7, Phases 5–6 |
| Planning and allocation engine | 20% | 12 independent rules, snapshots, deferral with reasons, validated publication | No automatic or assisted allocation | Phase 4 |
| Degradation, offline, recovery | 10% | `field-core` outbox, idempotent sync, stored conflicts, reconcile screen, `SyncIT` | None; rehearse for video | Phase 8 |
| Fidelity to Day 5 design | 10% | Store rebuilt frame by frame; forecast restyled | Departures not in README | Phase 9 |
| Demo video | 10% | — | Not recorded | Phase 0 |
| Creativity | 5% | Honest unavailable states, dataset-derived catalog sizing, explainable deferrals | Optional LLM advisory | Phase 10 |

### Four-role coverage

| Role | Figma | Frontend | Backend | DB | Responsive | E2E |
|---|---|---|---|---|---|---|
| Store Manager | `412:8556` | Complete, rebuilt 2026-10-04 | `ordering`, `receipt` | `customer_order`, `order_line`, `product*`, `receipt_*` | Desktop verified; phone unverified | `store-order.spec.ts` passing |
| Dispatcher | `412:8554` | Complete; phase wording to remove | `planning`, `ordering`, `exceptions`, `forecast`, `fleetops` | `planning_snapshot`, `plan`, `trip`, `stop`, `deferral` | Desktop verified; tablet unverified | `dispatcher-workspace`, `manual-planning`, `planning-*`, `deferral` |
| Loader | `412:8555` | Complete | `loading` | `load_task`, `load_line`, `loading_issue` | Tablet built; **phone unverified** | `loader.spec.ts` |
| Driver | `52:330` | Complete | `delivery`, `sync` | `delivery_trip`, `stop_visit`, `delivery_record`, `pod_asset`, `sync_command` | Phone shell built | `driver.spec.ts`, `driver-offline.spec.ts`; one flaky unit test |

### Cross-role flow

| Handoff | Persisted state | Consumer | Status |
|---|---|---|---|
| Store places order | `customer_order` (+ `order_line`) | Dispatcher orders/planning queue | Working |
| Dispatcher plans and validates | `planning_snapshot`, `plan`, `trip`, `stop` | Validator, publication | Working |
| Dispatcher defers | `deferral`, `deferral_acknowledgement` | Store deferral notice, next run | Working |
| Dispatcher publishes | versioned manifest, `load_task` | Loader | Working |
| Loader loads / flags shortfall | `load_line`, `loading_issue` | Driver handover, dispatcher exceptions | Working; phone unverified |
| Driver delivers / records POD | `delivery_record`, `pod_asset`, `stop_visit` | Store deliveries | Working |
| Driver offline then reconnects | `sync_command` (idempotent) | Reconcile screen, dispatcher | Working |
| Store confirms or disputes | `receipt_confirmation`, `receipt_discrepancy` | Dispatcher receipt discrepancies | Working |
| Dispatcher resolves | resolved discrepancy, `receipt_confirmed` | Store issues, live operations | Working |

### Demo data provenance

| Data | Class | Allowed use |
|---|---|---|
| Outlets, vehicles, calendar, district travel, service allowances | **COMPETITION** (General Data) | Authoritative. Capacities, windows, access, fuel quotas, travel times — never invented or overridden |
| Peak-day order scenarios, fleet availability (`Test Data/task2b_*`) | **COMPETITION**, but Datathon round | Currently seeds the demo day. Replace with a Round 2 seed derived from General Data (Phase 1) |
| `deliveries_train.csv` weekly aggregate | **DERIVED** from Datathon training data | Advisory forecast only; absent file → honest unavailable state |
| Per-unit weight/volume averages by brand and temperature | **DERIVED** from imported orders | Sizes catalog items and order estimates; never a planning input |
| Product categories, item names, relative sizes | **DEMO/ENRICHMENT** | Display and order composition only. No prices. Must not alter capacity, windows or any rule |
| Order quantities, shortfall reasons, POD, receipts, disputes, deferral reasons | **USER-ENTERED** | Authoritative operational truth |
| Map coordinates / district schematic | **DEMO/ENRICHMENT**, display-only | Must never feed planning, fuel, ETA, sequencing or R1–R12 |

### Final readiness checklist (P0/P1 only)

- [ ] **[P0]** Work committed, merged and pushed before 11:59 PM
- [ ] **[P0]** Repository renamed `TeamName_SolutionName`
- [ ] **[P0]** Public URL live with four working seeded logins
- [ ] **[P0]** README: numbered four-role judge walkthrough
- [ ] **[P0]** README: significant departures from the Designathon design
- [ ] **[P0]** `docs/AI_DISCLOSURE.md`
- [ ] **[P0]** `docs/architecture/` architecture diagram + data model
- [ ] **[P0]** Unlisted 5–8 minute demo video
- [ ] **[P0]** Submission form completed
- [ ] **[P1]** Demo day seeds without Datathon `Test Data/`
- [ ] **[P1]** Assisted allocation proposing a validated plan
- [ ] **[P1]** Internal phase numbers removed from user-visible text
- [ ] **[P1]** Lifecycle E2E run against the deployment candidate
- [ ] **[P1]** Loader and driver verified at phone width
