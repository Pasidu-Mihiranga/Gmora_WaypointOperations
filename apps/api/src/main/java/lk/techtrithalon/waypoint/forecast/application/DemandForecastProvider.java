package lk.techtrithalon.waypoint.forecast.application;

import java.util.List;
import lk.techtrithalon.waypoint.forecast.infrastructure.DemandHistoryRepository;

/**
 * Produces a demand outlook for one depot+brand series from its observed history.
 *
 * <p>This is the seam a later machine-learning provider plugs into. Because the method name and
 * version travel in the response, a replacement needs no change to the API shape or the web UI.
 * A new provider should replace the baseline only when it beats it on the same rolling-origin,
 * no-leakage comparison; the baseline stays available as benchmark and fallback.
 */
public interface DemandForecastProvider {
    String method();

    String methodVersion();

    /** Completed weeks the calculation needs before it will publish a value. */
    int minWeeks();

    /**
     * @param history completed weeks for one series, oldest first; never includes the week being forecast
     * @return the series outlook, or an empty outlook when history is insufficient
     */
    SeriesForecast forecast(List<DemandHistoryRepository.Week> history);
}
