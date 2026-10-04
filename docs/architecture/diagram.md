# Architecture diagram

## Components and deployment

Four containers, defined in [`docker-compose.yml`](../../docker-compose.yml): a Postgres database,
a Spring Boot API, a Python intelligence service, and a static web build served behind nginx. The
API is the only service that talks to the database or to intelligence; the web app only ever calls
the API.

```mermaid
flowchart TB
  subgraph Browser["Browser — four role workspaces"]
    WEB["web (React + TypeScript, Vite build, served by nginx)<br/>Dispatcher · Store Manager · Loader · Driver"]
  end

  subgraph Container["docker compose"]
    API["api (Spring Boot)<br/>ordering · planning · loading · delivery · sync<br/>receipt · exceptions · fleetops · forecast · identity"]
    INT["intelligence (FastAPI / Python)<br/>health-checked by api; forecasting/planning packages are stubs today"]
    DB[("postgres 16<br/>Flyway-migrated schema")]
  end

  WEB -- "HTTPS, session cookie" --> API
  API -- "SQL (JDBC)" --> DB
  API -- "HTTP (INTELLIGENCE_BASE_URL)" --> INT
  API -- "signed upload" --> CLOUD[("Cloudinary<br/>proof-of-delivery photos — ADR 0001")]
```

Each role's web client talks to the same API through a single generated OpenAPI client
(`apps/web/src/generated/api.d.ts`, regenerated from `apps/api/openapi.json`), so the frontend
cannot silently drift from the backend contract.

## Request flow — placing and planning an order

```mermaid
sequenceDiagram
  participant Store as Store Manager (web)
  participant API as api (Spring Boot)
  participant DB as postgres
  participant Dispatcher as Dispatcher (web)

  Store->>API: POST /api/v1/store/orders (lines, temperature)
  API->>DB: insert customer_order, order_line
  API-->>Store: 201 order confirmed

  Dispatcher->>API: POST /api/v1/planning/snapshots (freeze today's queue)
  API->>DB: insert planning_snapshot (orders, fleet, windows, fuel — content-hashed)
  API-->>Dispatcher: snapshot version

  Dispatcher->>API: manual allocation + PlanValidator checks (R1–R12)
  API->>DB: upsert plan, plan_order_disposition
  Dispatcher->>API: POST /api/v1/planning/plans/{id}/publish
  API->>DB: insert trip, stop, load_task (versioned manifest)
  API-->>Dispatcher: published plan, visible to loader/driver next
```

## Cross-role order lifecycle

One order reference travels through every role; this is what
[`tests/e2e/lifecycle.spec.ts`](../../tests/e2e/lifecycle.spec.ts) exercises end to end.

```mermaid
flowchart LR
  A["Store places order<br/>customer_order, order_line"] --> B["Dispatcher plans & validates<br/>planning_snapshot, plan, trip, stop"]
  B -- "over capacity" --> B2["Dispatcher defers<br/>deferral, deferral_acknowledgement"]
  B --> C["Dispatcher publishes<br/>versioned manifest, load_task"]
  C --> D["Loader loads / flags shortfall<br/>load_line, loading_issue"]
  D --> E["Driver delivers, records POD<br/>delivery_record, pod_asset, stop_visit"]
  E -. "offline" .-> E2["Driver reconnects<br/>sync_command (idempotent)"]
  E2 --> E
  E --> F["Store confirms or disputes<br/>receipt_confirmation, receipt_discrepancy"]
  F -- "dispute" --> G["Dispatcher resolves<br/>resolved discrepancy, receipt_confirmed"]
  B2 -. "notice" .-> A
```

## Module boundaries (Spring Boot, `apps/api`)

Each business concern is its own Java package under
`apps/api/src/main/java/lk/techtrithalon/waypoint/`, matching one or more Flyway migrations and
its own integration test suite:

| Module | Owns |
|---|---|
| `identity` | Accounts, sessions, login |
| `reference` | Outlets, vehicles, calendar, district travel, service allowances (General Data import) |
| `ordering` | Customer orders, order lines, synthetic product catalog |
| `planning` | Snapshots, the twelve constraint rules, plans, deferral, publication |
| `loading` | Load tasks/lines, shortfall/damage issues |
| `delivery` | Trips, stops, delivery records, proof of delivery |
| `sync` | Idempotent offline command replay and conflict storage |
| `receipt` | Store delivery view, receipt confirmation/dispute |
| `exceptions` | Cross-role exception queue (loading, delivery, offline, receipt) |
| `fleetops` | Fleet status and availability |
| `forecast` | Weekly demand history and the advisory outlook |
| `audit` | Audit event log |
| `notification`, `intelligence` (under `apps/api`) | Declared package structure, not yet populated — see §11 of `ROUND2_FINAL_COMPLETION_PLAN.md` |
| `shared` | Cross-cutting error handling, web config, request-id filter |
| `system` | `/health` and system status |

`planning`'s `PlanValidator` is the single source of truth for the twelve rules (R1–R12); nothing
else re-implements them, so a manual decision and an eventual automatic planner are checked by the
same code.
