package lk.techtrithalon.waypoint.forecast;

import java.math.BigDecimal;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param dataDir       directory holding the historical deliveries CSV (never committed; mounted read-only)
 * @param seedOnStartup aggregate the history into demand_history_week when the API starts (idempotent)
 * @param windowWeeks   how many completed weeks the baseline averages; 13 was the window chosen from a
 *                      rolling-origin comparison on the supplied history (see docs/FORECAST_VERIFICATION.md)
 * @param horizonWeeks  default number of future weeks returned
 * @param minWeeks      fewest completed weeks a series needs before any value is published
 * @param observedTailWeeks    recent completed weeks returned beside the projection
 * @param maxHorizonWeeks      largest horizon a caller may request
 * @param lowConfidenceVolumeM3 weekly volume below which a series is flagged as small-volume
 * @param staleAfterWeeks      the history is flagged old when it ends more than this many weeks before the run
 */
@ConfigurationProperties("app.forecast")
public record ForecastProperties(
    String dataDir,
    boolean seedOnStartup,
    int windowWeeks,
    int horizonWeeks,
    int minWeeks,
    int observedTailWeeks,
    int maxHorizonWeeks,
    BigDecimal lowConfidenceVolumeM3,
    int staleAfterWeeks
) {}
