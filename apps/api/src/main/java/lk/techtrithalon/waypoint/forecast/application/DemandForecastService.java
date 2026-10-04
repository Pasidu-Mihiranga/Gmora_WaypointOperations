package lk.techtrithalon.waypoint.forecast.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoField;
import java.time.temporal.ChronoUnit;
import java.time.temporal.IsoFields;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lk.techtrithalon.waypoint.forecast.ForecastProperties;
import lk.techtrithalon.waypoint.forecast.domain.DemandForecast;
import lk.techtrithalon.waypoint.forecast.infrastructure.DemandHistoryRepository;
import lk.techtrithalon.waypoint.fleetops.application.FleetService;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.reference.ReferenceProperties;
import lk.techtrithalon.waypoint.reference.application.ReferenceService;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

/**
 * Assembles the advisory demand outlook: observed history, a baseline projection per brand, and the
 * depot's fleet limits as context.
 *
 * <p>It deliberately draws no capacity conclusion. On the supplied history both depots run at about
 * a fifth of their volume capacity while deferrals occur every week for reasons unrelated to weekly
 * volume, so a capacity verdict here would be unfounded. Feasibility belongs to the planner alone.
 */
@Service
@PreAuthorize("hasRole('DISPATCHER')")
public class DemandForecastService {
    private static final int SCALE = 3;
    /** Recent completed weeks shown beside the projection. */
    private static final int OBSERVED_TAIL_WEEKS = 6;

    private final DemandHistoryRepository repository;
    private final DemandForecastProvider provider;
    private final ReferenceService reference;
    private final ReferenceProperties referenceProperties;
    private final FleetService fleet;
    private final ForecastProperties properties;
    private final Clock clock;

    public DemandForecastService(DemandHistoryRepository repository, DemandForecastProvider provider,
                                 ReferenceService reference, ReferenceProperties referenceProperties,
                                 FleetService fleet, ForecastProperties properties, Clock clock) {
        this.repository = repository;
        this.provider = provider;
        this.reference = reference;
        this.referenceProperties = referenceProperties;
        this.fleet = fleet;
        this.properties = properties;
        this.clock = clock;
    }

    public DemandForecast outlook(CurrentUser user, String requestedDepot, Integer requestedHorizon) {
        String depot = requestedDepot == null || requestedDepot.isBlank() ? user.depot() : requestedDepot;
        if (depot == null || !user.canAccessDepot(depot) || !reference.depots(user).contains(depot)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found");
        }
        int horizon = requestedHorizon == null ? properties.horizonWeeks() : requestedHorizon;
        if (horizon < 1 || horizon > 26) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_HORIZON",
                "horizonWeeks must be between 1 and 26");
        }

        List<String> brands = repository.brands(depot);
        List<DemandForecast.SeriesRow> series = new ArrayList<>();
        BigDecimal depotTotal = BigDecimal.ZERO;
        BigDecimal depotChilled = BigDecimal.ZERO;
        BigDecimal depotLow = BigDecimal.ZERO;
        BigDecimal depotHigh = BigDecimal.ZERO;
        boolean anyAvailable = false;

        for (String brand : brands) {
            var history = repository.series(depot, brand);
            var result = provider.forecast(history);
            boolean chilledApplicable = history.stream()
                .anyMatch(week -> week.chilledVolumeM3().signum() > 0);
            series.add(new DemandForecast.SeriesRow(brand,
                confidence(result),
                basis(result, history, chilledApplicable),
                result.sampleWeeks(), result.totalM3(), result.chilledM3(), chilledApplicable));
            if (!result.available()) continue;
            anyAvailable = true;
            depotTotal = depotTotal.add(result.totalM3());
            depotChilled = depotChilled.add(result.chilledM3());
            depotLow = depotLow.add(result.lowDeltaM3() == null ? result.totalM3() : result.lowDeltaM3());
            depotHigh = depotHigh.add(result.highDeltaM3() == null ? result.totalM3() : result.highDeltaM3());
        }

        var observed = repository.depotSeries(depot);
        var latest = observed.isEmpty() ? null : observed.getLast();
        LocalDate today = LocalDate.ofInstant(clock.instant(), ZoneId.of("Asia/Colombo"));
        Integer lag = latest == null ? null : Math.toIntExact(Math.max(0,
            ChronoUnit.WEEKS.between(weekMonday(latest.isoYear(), latest.isoWeek()),
                today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)))));
        return new DemandForecast(depot, provider.method(), provider.methodVersion(),
            properties.windowWeeks(), clock.instant(), latest == null ? null : latest.isoYear(),
            latest == null ? null : latest.isoWeek(), lag, true, capacity(user, depot),
            weeks(observed, today, horizon, anyAvailable,
                depotTotal, depotChilled, depotLow, depotHigh),
            series);
    }

    /**
     * Observed weeks already in history, then the future weeks of the horizon. Each future week
     * carries the same baseline, divided by that week's real operating days from the calendar.
     */
    private List<DemandForecast.WeekRow> weeks(List<DemandHistoryRepository.Week> history, LocalDate today, int horizon,
                                               boolean available, BigDecimal total, BigDecimal chilled,
                                               BigDecimal low, BigDecimal high) {
        List<DemandForecast.WeekRow> rows = new ArrayList<>();
        // A short tail of recent weeks is enough to read the projection against; a full horizon of
        // history would crowd the chart without telling the dispatcher anything more.
        int observedTail = Math.min(history.size(), OBSERVED_TAIL_WEEKS);
        for (var week : history.subList(history.size() - observedTail, history.size())) {
            rows.add(new DemandForecast.WeekRow(week.isoYear(), week.isoWeek(), week.operatingDays(), true,
                week.totalVolumeM3(), week.chilledVolumeM3(), null, null, null, null, null, null));
        }
        if (history.isEmpty()) return rows;

        var last = history.getLast();
        LocalDate start = today.with(TemporalAdjusters.next(DayOfWeek.MONDAY));
        LocalDate afterHistory = weekMonday(last.isoYear(), last.isoWeek()).plusWeeks(1);
        if (start.isBefore(afterHistory)) start = afterHistory;
        int startYear = start.get(IsoFields.WEEK_BASED_YEAR);
        int startWeek = start.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR);
        Map<List<Integer>, Integer> operatingDays = repository.calendarWeeks(startYear, startWeek, horizon).stream()
            .collect(Collectors.toMap(week -> List.of(week.isoYear(), week.isoWeek()),
                DemandHistoryRepository.Week::operatingDays));
        for (int index = 0; index < horizon; index++) {
            LocalDate monday = start.plusWeeks(index);
            int year = monday.get(IsoFields.WEEK_BASED_YEAR);
            int week = monday.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR);
            int count = operatingDays.getOrDefault(List.of(year, week), 0);
            BigDecimal days = BigDecimal.valueOf(count);
            rows.add(new DemandForecast.WeekRow(year, week, count, false,
                null, null,
                available ? total : null, available ? chilled : null,
                available ? low : null, available ? high : null,
                available ? perDay(total, days) : null, available ? perDay(chilled, days) : null));
        }
        return rows;
    }

    private static LocalDate weekMonday(int isoYear, int isoWeek) {
        return LocalDate.of(isoYear, 1, 4)
            .with(IsoFields.WEEK_OF_WEEK_BASED_YEAR, isoWeek)
            .with(ChronoField.DAY_OF_WEEK, DayOfWeek.MONDAY.getValue());
    }

    private DemandForecast.CapacityContext capacity(CurrentUser user, String depot) {
        var vehicles = fleet.fleet(user, referenceProperties.demoOperatingDate(), depot);
        var reefers = vehicles.stream().filter(vehicle -> "reefer".equals(vehicle.temp())).toList();
        return new DemandForecast.CapacityContext(vehicles.size(), reefers.size(),
            sumVolume(vehicles), sumVolume(reefers));
    }

    private static BigDecimal sumVolume(List<lk.techtrithalon.waypoint.fleetops.domain.FleetVehicle> vehicles) {
        return vehicles.stream().map(lk.techtrithalon.waypoint.fleetops.domain.FleetVehicle::volumeCapM3)
            .filter(java.util.Objects::nonNull)
            .reduce(BigDecimal.ZERO, BigDecimal::add).setScale(SCALE, RoundingMode.HALF_UP);
    }

    private static BigDecimal perDay(BigDecimal weekly, BigDecimal days) {
        return days.signum() == 0 ? null : weekly.divide(days, SCALE, RoundingMode.HALF_UP);
    }

    /** Brand series in the supplied history differ by an order of magnitude, so say so per series. */
    /** Weekly volume below this is small enough that week-to-week swings dominate the average. */
    private static final BigDecimal LOW_CONFIDENCE_VOLUME_M3 = BigDecimal.valueOf(100);

    private static String confidence(SeriesForecast result) {
        if (!result.available()) return "none";
        return result.totalM3().compareTo(LOW_CONFIDENCE_VOLUME_M3) < 0 ? "low" : "high";
    }

    private String basis(SeriesForecast result, List<DemandHistoryRepository.Week> history,
                         boolean chilledApplicable) {
        if (!result.available()) {
            return "Needs " + provider.minWeeks() + " completed weeks; " + history.size() + " available.";
        }
        String note = "Average of the last " + Math.min(properties.windowWeeks(), history.size())
            + " completed weeks of " + history.size() + " observed.";
        if (!chilledApplicable) note += " This brand has no chilled demand in the history, so chilled stays zero.";
        if ("low".equals(confidence(result))) {
            note += " Weekly volume is small, so this series varies widely week to week.";
        }
        return note;
    }
}
