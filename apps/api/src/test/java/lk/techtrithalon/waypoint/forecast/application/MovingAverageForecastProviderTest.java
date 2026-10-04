package lk.techtrithalon.waypoint.forecast.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import lk.techtrithalon.waypoint.forecast.ForecastProperties;
import lk.techtrithalon.waypoint.forecast.infrastructure.DemandHistoryRepository;
import org.junit.jupiter.api.Test;

/** Synthetic weekly series; no dataset values. */
class MovingAverageForecastProviderTest {
    private static final ForecastProperties PROPERTIES =
        new ForecastProperties("unused", false, 13, 10, 13, 6, 26, java.math.BigDecimal.valueOf(100), 1);
    private final MovingAverageForecastProvider provider = new MovingAverageForecastProvider(PROPERTIES);

    private static DemandHistoryRepository.Week week(int isoWeek, double total, double chilled) {
        return new DemandHistoryRepository.Week(2026, isoWeek, 6,
            BigDecimal.valueOf(total), BigDecimal.valueOf(chilled));
    }

    private static List<DemandHistoryRepository.Week> flat(int count, double total, double chilled) {
        List<DemandHistoryRepository.Week> weeks = new ArrayList<>();
        for (int i = 1; i <= count; i++) weeks.add(week(i, total, chilled));
        return weeks;
    }

    @Test
    void averagesTheConfiguredWindowOfCompletedWeeks() {
        var history = flat(20, 100, 30);
        // Only the last 13 weeks count, so a different early level must not move the answer.
        history.set(0, week(1, 1_000, 500));
        var result = provider.forecast(history);
        assertThat(result.available()).isTrue();
        assertThat(result.sampleWeeks()).isEqualTo(20);
        assertThat(result.totalM3()).isEqualByComparingTo("100");
        assertThat(result.chilledM3()).isEqualByComparingTo("30");
    }

    @Test
    void reportsUnavailableRatherThanExtrapolatingFromTooLittleHistory() {
        var result = provider.forecast(flat(12, 100, 30));
        assertThat(result.available()).isFalse();
        assertThat(result.sampleWeeks()).isEqualTo(12);
        assertThat(result.totalM3()).isNull();
        assertThat(result.lowDeltaM3()).isNull();
    }

    @Test
    void keepsChilledAtZeroForASeriesThatHasNoChilledDemand() {
        var result = provider.forecast(flat(15, 80, 0));
        assertThat(result.available()).isTrue();
        assertThat(result.chilledM3()).isEqualByComparingTo("0");
    }

    @Test
    void usesOnlyTheWeeksItWasGiven() {
        // The provider has no access to a repository or clock, so a forecast for week 21 computed
        // from weeks 1..20 cannot see week 21. Truncating the history must change the answer.
        var full = flat(20, 100, 30);
        for (int i = 13; i < 20; i++) full.set(i, week(i + 1, 200, 60));
        var fromAll = provider.forecast(full);
        var fromEarlierOrigin = provider.forecast(new ArrayList<>(full.subList(0, 13)));
        assertThat(fromAll.totalM3()).isNotEqualByComparingTo(fromEarlierOrigin.totalM3());
        assertThat(fromEarlierOrigin.totalM3()).isEqualByComparingTo("100");
    }

    @Test
    void reportsTheObservedSpreadAroundTheBaselineInsteadOfAModelInterval() {
        var history = flat(30, 100, 30);
        for (int i = 20; i < 30; i++) history.set(i, week(i + 1, i % 2 == 0 ? 140 : 60, 30));
        var result = provider.forecast(history);
        assertThat(result.lowDeltaM3()).isNotNull();
        assertThat(result.highDeltaM3()).isNotNull();
        assertThat(result.lowDeltaM3()).isLessThan(result.totalM3());
        assertThat(result.highDeltaM3()).isGreaterThan(result.totalM3());
        // A band is never negative volume.
        assertThat(result.lowDeltaM3()).isGreaterThanOrEqualTo(BigDecimal.ZERO);
    }

    @Test
    void declaresItsMethodAndVersionSoALaterProviderIsDistinguishable() {
        assertThat(provider.method()).isEqualTo("moving_average");
        assertThat(provider.methodVersion()).isEqualTo("13w.1");
        assertThat(provider.minWeeks()).isEqualTo(13);
    }
}
