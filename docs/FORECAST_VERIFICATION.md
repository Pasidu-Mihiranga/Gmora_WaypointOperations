# Demand forecast verification

Advisory demand outlook for the dispatcher (`GET /api/v1/dispatcher/forecast/demand`). Nothing here
is an input to planning: allocation, sequencing and the R1–R12 validator are untouched.

## Why a moving average, and why no capacity risk

The method was chosen by a rolling-origin comparison on the supplied history (2024-01-01 to
2026-02-14, 111 ISO weeks, 2 depots × 3 brands). Each method forecast horizons 1–10 from 40 origins
per series using only weeks completed at the origin, so no future information was used.

| method | total WAPE | total bias | chilled WAPE |
|---|---|---|---|
| ma17 | 7.65% | −1.53% | 7.25% |
| med13 | 7.71% | −1.95% | 7.41% |
| **ma13 (chosen)** | **7.72%** | **−1.32%** | **7.17%** |
| ma8 | 7.84% | −1.16% | 7.03% |
| ma8 × week-of-year index | 8.70% | −1.79% | — |
| weighted MA (4 weeks) | 8.90% | −0.99% | — |
| seasonal naive (52 weeks) | 9.67% | −4.88% | — |
| previous week | 11.66% | −0.80% | — |

A plain long average beat recency weighting, seasonal-naive and a seasonal index: the series are a
near-stable level plus noise, so recency weighting amplifies noise. The 8–26 week window is a flat
plateau; 13 weeks sits within 0.1pp of the best for total and is best among long windows for chilled,
and is explainable as one quarter of history.

**No capacity-risk warning is produced, deliberately.** In the same history, p95 daily volume
utilisation is 24–25% and weight 22–23% at both depots, and reefer volume runs near 29%; volume
capacity is never the binding constraint. The 1,543 recorded deferrals are uncorrelated with weekly
demand (Pearson r = 0.186) and occur in 96–100% of weeks at a steady rate across every demand
quartile. They are 100% Fresh, 99.5% chilled, 98% Peliyagoda and concentrated in Colombo outlets with
07:30–08:00 window closes. A forecast-versus-capacity verdict would therefore read "clear" on exactly
the days orders were deferred. Capacity is shown as a fact; feasibility stays with plan validation.

## Correctness decisions

- Demand is keyed on `order_date`, not `dispatch_date`. A deferred order is one record whose dispatch
  date is later, so the order date counts it once in the week it was ordered.
- Every record counts as demand whatever its dispatch status: an order that was deferred or never run
  was still ordered.
- A week is kept only when the file's date range covers all of its operating days, so a partial first
  or last week cannot depress the baseline.
- Chilled is Fresh-only in the supplied history. Style and Tech return exactly 0 with
  `chilledApplicable: false` rather than noise.
- Weekly figures convert to per-day using that week's real operating days from `calendar_day`
  (4 to 6 in the supplied calendar), never a fixed divisor.
- Series below 100 m³/week are returned as `confidence: "low"`; Tech ran 29–36% WAPE at 26–38 m³/week.

## Evidence

Aggregation on the running stack: `Aggregated 92307 historical deliveries (2024-01-01 to 2026-02-14)
into 666 weekly rows; 0 partial weeks skipped` — 6 series × 111 weeks.

PostgreSQL agreed with the independent offline audit:

| depot | brand | weeks | avg m³/wk | avg chilled |
|---|---|---|---|---|
| Kandy | Fresh | 111 | 499 | 181 |
| Kandy | Style | 111 | 81 | 0 |
| Kandy | Tech | 111 | 21 | 0 |
| Peliyagoda | Fresh | 111 | 954 | 352 |
| Peliyagoda | Style | 111 | 141 | 0 |
| Peliyagoda | Tech | 111 | 30 | 0 |

Curl against the running stack (`API_PORT=8081`):

| request | status | result |
|---|---|---|
| `GET /forecast/demand?depot=Peliyagoda&horizonWeeks=10` | 200 | `moving_average 13w.1`, capacity 38 vehicles / 1012.5 m³ / 9 reefers / 207.5 m³; W8 projection 1179.567 m³ (196.595 per operating day), band 1082.571–1303.207 |
| same, series | 200 | Fresh high 998.309 / 358.562 chilled; Style high 142.839 / 0.0; Tech low 38.419 / 0.0; 111 sample weeks each |
| `?horizonWeeks=0` | 400 | `INVALID_HORIZON` |
| `?horizonWeeks=27` | 400 | `INVALID_HORIZON` |
| `?depot=UNKNOWN` | 404 | `NOT_FOUND` |
| no session | 401 | `UNAUTHENTICATED` |
| store-manager session | 403 | `FORBIDDEN` |

Every failure body carried a `traceId` equal to `X-Request-Id` and leaked no internals. The path
appears in `GET /v3/api-docs`; `apps/api/openapi.json` and the TypeScript client were regenerated and
the drift test passed. API values matched the independent offline audit (1179.6 against 1178 m³/week;
chilled 358.6 against 358).

Tests: `ForecastReadIT` (3) covers the honest unavailable state, the per-brand projection with
operating-day conversion, and the refusal paths including depot scoping.
`MovingAverageForecastProviderTest` (6) covers the window, insufficient history, the Fresh-only
chilled zero, the observed spread, method metadata, and that the provider uses only the weeks it is
given. A quiet consistency block in `scripts/smoke.sh` checks that observed weeks carry no forecast,
projected weeks carry no observation, operating days are sane, and unavailable series publish nothing.

## Known gaps

- `scripts/smoke.sh` still stops earlier, at the pre-existing "confirmed queue is empty" check, because
  the seeded day is fully published. The forecast block was therefore run directly against the live
  response rather than through the script.
- No dedicated web component test for the Forecast screen (deferred by the owner). `routes.test.tsx`
  does cover its honest empty state, and the full web suite (156 tests), lint and build are clean.
- The historical deliveries file is mounted read-only and never committed. Without it the screen shows
  an honest unavailable state and nothing else is affected.
