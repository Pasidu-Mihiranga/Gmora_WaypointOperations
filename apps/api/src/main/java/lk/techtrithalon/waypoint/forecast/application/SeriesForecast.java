package lk.techtrithalon.waypoint.forecast.application;

import java.math.BigDecimal;

/**
 * One series' outlook. {@code available} is false when history was too short to publish anything,
 * which the API reports as an honest unavailable state rather than an extrapolated number.
 *
 * @param lowDeltaM3  low end of the observed spread of actual weeks around this baseline
 * @param highDeltaM3 high end of that spread
 */
public record SeriesForecast(boolean available, int sampleWeeks,
                             BigDecimal totalM3, BigDecimal chilledM3,
                             BigDecimal lowDeltaM3, BigDecimal highDeltaM3) {
    public static SeriesForecast unavailable(int sampleWeeks) {
        return new SeriesForecast(false, sampleWeeks, null, null, null, null);
    }
}
