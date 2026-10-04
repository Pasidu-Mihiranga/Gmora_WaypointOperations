package lk.techtrithalon.waypoint.forecast.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * An advisory demand outlook for one depot. Every figure is derived from observed history only.
 *
 * <p>This is not a capacity verdict. The supplied history runs at roughly a fifth of depot volume
 * capacity, so the response carries capacity as context and never claims a shortfall or feasibility;
 * only the planner's R1-R12 validation decides what can actually be delivered.
 *
 * @param method        identifier of the calculation that produced the values
 * @param methodVersion version of that calculation, so a later provider is distinguishable
 * @param windowWeeks   completed weeks averaged per series

 * @param historyStale  true when the recorded history ends more than the configured number of weeks before the run
 * @param timeZone      business time zone that generatedAt and the week dates are read in
 * @param advisory      always true; forecasts never feed planning
 */
public record DemandForecast(
    String depot,
    String method,
    String methodVersion,
    int windowWeeks,
    Instant generatedAt,
    Integer latestObservedIsoYear,
    Integer latestObservedIsoWeek,
    Integer weeksSinceLastObservation,
    boolean historyStale,
    String timeZone,
    boolean advisory,
    CapacityContext capacity,
    List<WeekRow> weeks,
    List<SeriesRow> series
) {
    /** Depot fleet limits for one trip per vehicle, shown as a fact rather than compared to a verdict. */
    public record CapacityContext(int vehicles, int reeferVehicles,
                                  BigDecimal volumeCapM3, BigDecimal reeferVolumeCapM3) {}

    /**
     * One ISO week of the outlook. Observed values are present for completed weeks and null for
     * future weeks; forecast values are present only once a series has enough history.
     *
     * @param operatingDays operating days in this week, used for the per-day figures
     * @param lowTotalM3    low end of the observed historical spread around the baseline, not a model interval
     */
    public record WeekRow(int isoYear, int isoWeek, int operatingDays, boolean observed,
                          BigDecimal observedTotalM3, BigDecimal observedChilledM3,
                          BigDecimal forecastTotalM3, BigDecimal forecastChilledM3,
                          BigDecimal lowTotalM3, BigDecimal highTotalM3,
                          BigDecimal forecastTotalPerDayM3, BigDecimal forecastChilledPerDayM3) {}

    /**
     * Per-brand outlook with its own confidence, because the supplied history differs sharply by brand.
     *
     * @param confidence  "high", "low" or "none"; "none" means too little history to publish a value
     * @param basis       plain-language note on where this series' numbers come from
     * @param sampleWeeks completed weeks actually available for this series
     */
    public record SeriesRow(String brand, String confidence, String basis, int sampleWeeks,
                            BigDecimal forecastTotalM3, BigDecimal forecastChilledM3,
                            boolean chilledApplicable) {}
}
