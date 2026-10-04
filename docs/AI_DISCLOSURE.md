# AI tool disclosure

This document covers the whole submission: the Designathon prototype and the Round 2 build. It
exists separately from [`docs/waypoint-design-documentation.md`](waypoint-design-documentation.md)
§11, which disclosed AI use for the design stage only; this file repeats that disclosure and adds
the engineering stage, which the design document predates.

## Design stage (Figma prototype)

Carried over from `waypoint-design-documentation.md` §11, unchanged:

| Tool | What it was used for |
|---|---|
| **OpenAI Codex** | Requirement analysis, flow and rationale drafting, copy refinement, and cross-checking screens against the operating constraints |
| **Claude Code with the Figma MCP** | Reading and editing the Figma file programmatically: building and correcting frames, applying design tokens, auditing every screen against the operating constraints, and generating the design document and its diagrams |
| **Figma agent** | In-canvas design generation and layout assistance while building screens |

## Engineering stage (this codebase)

| Tool | What it was used for |
|---|---|
| **Claude Code** | The primary coding agent for this repository: Spring Boot modules (`ordering`, `planning`, `loading`, `delivery`, `sync`, `receipt`, `exceptions`, `fleetops`, `forecast`), Flyway migrations, the React/TypeScript frontend, Testcontainers-backed integration tests, Vitest/Playwright tests, and documentation (including this file and `docs/WORK_LOG.md`) |

No other AI coding tool was used to write or modify application code in this repository.

### What the humans did

The team set the module boundaries and the Spring ↔ Python split, approved every architecture and
schema decision, and made every call that the governing rules ([`AGENTS.md`](../AGENTS.md),
[`CLAUDE.md`](../CLAUDE.md)) require a human to make before the agent proceeds:

- Architecture, dependency and schema changes
- Introducing or shaping the synthetic product catalog (no prices, no dataset-derived figures
  committed), after confirming the dataset carries no product/price data
- What counts as an honest "not available yet" state versus a feature worth building
- Every `git push`, PR, and deployment action

AGENTS.md §2 requires the agent to stop and explain before any architecture change, schema change,
or outward-facing action (push, PR, deploy), rather than deciding unilaterally. §1 forbids
hard-coded or mocked data in application code; anything the backend cannot yet supply must render
as an honest empty state rather than a plausible-looking number.

### How the output was checked

Every AI-authored change in this codebase went through the same verification path, visible in
[`docs/WORK_LOG.md`](WORK_LOG.md) and the per-feature `docs/*_VERIFICATION.md` files:

- A Flyway migration plus a Spring module change is covered by a Testcontainers integration test
  (e.g. `OrderCommandIT`, `ReceiptIT`, `SyncIT`) before being considered done
- The OpenAPI contract is regenerated and the generated TypeScript client is rebuilt, so the
  frontend cannot silently drift from the backend contract
- Frontend changes carry Vitest unit/component tests and, for cross-role flows, Playwright E2E
  specs (`tests/e2e/lifecycle.spec.ts`, `store-order.spec.ts`, `loader.spec.ts`, `driver.spec.ts`)
- `scripts/smoke.sh` is run against a clean throwaway stack (`docker compose up` plus curl checks)
  before a feature is marked complete
- A plan checkbox in `docs/IMPLEMENTATION_PLAN.md` is only marked done with evidence — a passing
  test run, a running screen, or a verification doc entry — never on the agent's say-so alone

Where data was genuinely unavailable (the ten-week demand forecast when `Training Data/` is
absent, product prices, an editable profile), the screens say so explicitly rather than
fabricating a plausible number — this is a deliberate, human-approved product decision recorded
in `docs/WORK_LOG.md`, not an oversight.
