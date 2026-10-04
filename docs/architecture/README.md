# Architecture

This directory holds the current architecture diagram and data model for the shipped system, as
required by the booklet's submission checklist. It reflects what actually runs in
`docker-compose.yml` today, not the Designathon-stage proposal — see
[`../WAYPOINT_PHASE2_ANALYSIS.md`](../WAYPOINT_PHASE2_ANALYSIS.md) for that superseded, historical
Next.js/Prisma sketch.

Contents:
- [`diagram.md`](diagram.md) — component and deployment diagram, request flow, and the
  cross-role order lifecycle
- [`data-model.md`](data-model.md) — the Postgres schema, grouped by module, with the
  relationships that matter for the planning and delivery flow

For the detailed rationale behind each module and constraint rule, see
[`../TECHNICAL_REFERENCE.md`](../TECHNICAL_REFERENCE.md).
