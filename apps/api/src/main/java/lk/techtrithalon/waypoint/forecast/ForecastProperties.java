package lk.techtrithalon.waypoint.forecast;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param dataDir       directory holding the historical deliveries CSV (never committed; mounted read-only)
 * @param seedOnStartup aggregate the history into demand_history_week when the API starts (idempotent)
 * @param windowWeeks   how many completed weeks the baseline averages; 13 was the window chosen from a
 *                      rolling-origin comparison on the supplied history (see docs/FORECAST_VERIFICATION.md)
 * @param horizonWeeks  default number of future weeks returned
 * @param minWeeks      fewest completed weeks a series needs before any value is published
 */
@ConfigurationProperties("app.forecast")
public record ForecastProperties(
    String dataDir,
    boolean seedOnStartup,
    int windowWeeks,
    int horizonWeeks,
    int minWeeks
) {}
