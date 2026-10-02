package lk.techtrithalon.waypoint.forecast.infrastructure;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lk.techtrithalon.waypoint.forecast.ForecastProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Aggregates the supplied historical deliveries into weekly demand per depot and brand.
 *
 * <p>Only the aggregate is stored: roughly six hundred rows rather than the ninety thousand source
 * records, and no outlet, order or vehicle identifier is copied. The CSV is never committed; Compose
 * mounts it read-only, and a missing file simply leaves the forecast unavailable.
 *
 * <p>Two decisions matter for correctness. Demand is keyed on {@code order_date}, not
 * {@code dispatch_date}: a deferred order is one record whose dispatch date is later, so keying on the
 * order date counts it once, in the week it was actually ordered. Every row counts as demand whatever
 * its dispatch status, because an order that was deferred or never run was still ordered. Weeks are
 * skipped unless every one of their operating days falls inside the file's date range, so a partial
 * first or last week cannot depress the baseline.
 */
@Component
@Order(30)
@ConditionalOnProperty(name = "app.forecast.seed-on-startup", havingValue = "true", matchIfMissing = true)
public class DemandHistorySeeder implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(DemandHistorySeeder.class);
    private static final String FILENAME = "deliveries_train.csv";

    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final ForecastProperties properties;

    public DemandHistorySeeder(JdbcTemplate db, TransactionTemplate tx, ForecastProperties properties) {
        this.db = db;
        this.tx = tx;
        this.properties = properties;
    }

    @Override
    public void run(ApplicationArguments args) {
        seed();
    }

    public void seed() {
        Integer existing = db.queryForObject("SELECT count(*) FROM demand_history_week", Integer.class);
        if (existing != null && existing > 0) {
            log.info("Demand history already aggregated ({} weekly rows); skipping", existing);
            return;
        }
        Path file = Path.of(properties.dataDir()).resolve(FILENAME);
        if (!Files.isReadable(file)) {
            log.info("No historical deliveries at {}; the demand forecast stays unavailable", file.toAbsolutePath());
            return;
        }
        tx.executeWithoutResult(status -> aggregate(file));
    }

    private record Key(String depot, String brand, int isoYear, int isoWeek) {}

    private static final class Totals {
        int orders;
        BigDecimal total = BigDecimal.ZERO;
        BigDecimal chilled = BigDecimal.ZERO;
    }

    private void aggregate(Path file) {
        // Operating dates per ISO week, from the seeded calendar. Closed days never carry orders.
        Map<List<Integer>, Set<LocalDate>> operatingDates = new HashMap<>();
        Map<LocalDate, List<Integer>> weekOfDate = new HashMap<>();
        db.query("SELECT date, iso_year, iso_week, is_operating FROM calendar_day", rs -> {
            LocalDate date = rs.getDate("date").toLocalDate();
            List<Integer> week = List.of(rs.getInt("iso_year"), rs.getInt("iso_week"));
            weekOfDate.put(date, week);
            if (rs.getBoolean("is_operating")) {
                operatingDates.computeIfAbsent(week, key -> new HashSet<>()).add(date);
            }
        });

        Map<Key, Totals> aggregate = new HashMap<>();
        LocalDate earliest = null;
        LocalDate latest = null;
        int rows = 0;
        for (Map<String, String> row : read(file)) {
            LocalDate orderDate = LocalDate.parse(row.get("order_date"));
            if (earliest == null || orderDate.isBefore(earliest)) earliest = orderDate;
            if (latest == null || orderDate.isAfter(latest)) latest = orderDate;
            rows++;
            List<Integer> week = weekOfDate.get(orderDate);
            if (week == null) continue;
            var totals = aggregate.computeIfAbsent(
                new Key(row.get("depot"), row.get("brand"), week.get(0), week.get(1)), key -> new Totals());
            BigDecimal volume = new BigDecimal(row.get("order_volume_m3"));
            totals.orders++;
            totals.total = totals.total.add(volume);
            if ("chilled".equals(row.get("temp_requirement"))) totals.chilled = totals.chilled.add(volume);
        }
        if (earliest == null) {
            log.info("Historical deliveries file held no rows; the demand forecast stays unavailable");
            return;
        }

        LocalDate from = earliest;
        LocalDate to = latest;
        int written = 0;
        int skipped = 0;
        for (var entry : aggregate.entrySet()) {
            Key key = entry.getKey();
            Set<LocalDate> days = operatingDates.get(List.of(key.isoYear(), key.isoWeek()));
            // Keep a week only when the file's date range covers every operating day in it, so a
            // partial first or last week cannot depress the baseline.
            boolean covered = days != null && !days.isEmpty()
                && days.stream().noneMatch(date -> date.isBefore(from) || date.isAfter(to));
            if (!covered) {
                skipped++;
                continue;
            }
            Totals totals = entry.getValue();
            db.update("""
                INSERT INTO demand_history_week (depot, brand, iso_year, iso_week, operating_days,
                  order_count, total_volume_m3, chilled_volume_m3)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (depot, brand, iso_year, iso_week) DO NOTHING
                """, key.depot(), key.brand(), key.isoYear(), key.isoWeek(), days.size(),
                totals.orders, totals.total, totals.chilled);
            written++;
        }
        log.info("Aggregated {} historical deliveries ({} to {}) into {} weekly rows; {} partial weeks skipped",
            rows, earliest, latest, written, skipped);
    }

    private static List<Map<String, String>> read(Path file) {
        List<String> lines;
        try {
            lines = Files.readAllLines(file);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read " + file, e);
        }
        if (lines.isEmpty()) throw new IllegalArgumentException("Empty CSV: " + file);
        List<String> header = split(lines.getFirst(), file);
        List<Map<String, String>> out = new java.util.ArrayList<>(lines.size());
        for (int i = 1; i < lines.size(); i++) {
            if (lines.get(i).isBlank()) continue;
            List<String> values = split(lines.get(i), file);
            if (values.size() != header.size()) {
                throw new IllegalArgumentException(file + " line " + (i + 1) + " has " + values.size()
                    + " fields, expected " + header.size());
            }
            Map<String, String> row = new HashMap<>(header.size());
            for (int f = 0; f < header.size(); f++) row.put(header.get(f), values.get(f));
            out.add(row);
        }
        return out;
    }

    /** The supplied file has no quoted fields; refuse rather than mis-parse if that ever changes. */
    private static List<String> split(String line, Path file) {
        if (line.contains("\"")) throw new IllegalArgumentException(file + " contains quoted fields; use a CSV parser");
        return List.of(line.split(",", -1));
    }
}
