package lk.techtrithalon.waypoint.forecast.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import lk.techtrithalon.waypoint.forecast.ForecastProperties;
import lk.techtrithalon.waypoint.forecast.infrastructure.DemandHistoryRepository;
import org.springframework.stereotype.Component;

/**
 * Simple moving average of the most recent completed weeks, applied flat across the horizon.
 *
 * <p>The window was chosen by rolling-origin comparison on the supplied history: a plain long
 * average beat recency weighting, seasonal-naive and a week-of-year seasonal index, because the
 * series are a near-stable level plus noise and recency weighting amplifies that noise. The method
 * deliberately holds one value across the horizon rather than implying a trend the data does not show.
 *
 * <p>No future information is used: callers pass only weeks completed before the forecast week.
 */
@Component
public class MovingAverageForecastProvider implements DemandForecastProvider {
    private static final int SCALE = 3;
    private final ForecastProperties properties;

    public MovingAverageForecastProvider(ForecastProperties properties) {
        this.properties = properties;
    }

    @Override
    public String method() {
        return "moving_average";
    }

    @Override
    public String methodVersion() {
        return properties.windowWeeks() + "w.1";
    }

    @Override
    public int minWeeks() {
        return properties.minWeeks();
    }

    @Override
    public SeriesForecast forecast(List<DemandHistoryRepository.Week> history) {
        int available = history.size();
        if (available < properties.minWeeks()) return SeriesForecast.unavailable(available);

        int window = Math.min(properties.windowWeeks(), available);
        List<DemandHistoryRepository.Week> recent = history.subList(available - window, available);
        BigDecimal total = mean(recent.stream().map(DemandHistoryRepository.Week::totalVolumeM3).toList());
        BigDecimal chilled = mean(recent.stream().map(DemandHistoryRepository.Week::chilledVolumeM3).toList());

        var spread = spread(history, window, total);
        return new SeriesForecast(true, available, total, chilled, spread[0], spread[1]);
    }

    /**
     * Observed spread of actual weeks around the same baseline, as a 10th-to-90th percentile band.
     * This reports how far history has actually moved; it is not a model confidence interval.
     */
    private BigDecimal[] spread(List<DemandHistoryRepository.Week> history, int window, BigDecimal baseline) {
        List<BigDecimal> deltas = new ArrayList<>();
        for (int origin = window; origin < history.size(); origin++) {
            BigDecimal base = mean(history.subList(origin - window, origin).stream()
                .map(DemandHistoryRepository.Week::totalVolumeM3).toList());
            deltas.add(history.get(origin).totalVolumeM3().subtract(base));
        }
        if (deltas.size() < 10) return new BigDecimal[] {null, null};
        deltas.sort(BigDecimal::compareTo);
        BigDecimal low = deltas.get((int) (0.10 * (deltas.size() - 1)));
        BigDecimal high = deltas.get((int) (0.90 * (deltas.size() - 1)));
        return new BigDecimal[] {
            baseline.add(low).max(BigDecimal.ZERO).setScale(SCALE, RoundingMode.HALF_UP),
            baseline.add(high).setScale(SCALE, RoundingMode.HALF_UP),
        };
    }

    private static BigDecimal mean(List<BigDecimal> values) {
        BigDecimal sum = values.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        return sum.divide(BigDecimal.valueOf(values.size()), SCALE, RoundingMode.HALF_UP);
    }
}
