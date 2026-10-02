package lk.techtrithalon.waypoint.forecast.infrastructure;

import java.math.BigDecimal;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Reads the aggregated weekly demand history. Read-only; the seeder is the only writer. */
@Repository
public class DemandHistoryRepository {
    private final JdbcTemplate db;

    public DemandHistoryRepository(JdbcTemplate db) {
        this.db = db;
    }

    /** One observed week of a depot+brand series. */
    public record Week(int isoYear, int isoWeek, int operatingDays, BigDecimal totalVolumeM3,
                       BigDecimal chilledVolumeM3) {}

    /** Completed weeks for one series, oldest first. */
    public List<Week> series(String depot, String brand) {
        return db.query("""
            SELECT iso_year, iso_week, operating_days, total_volume_m3, chilled_volume_m3
              FROM demand_history_week
             WHERE depot = ? AND brand = ?
             ORDER BY iso_year, iso_week
            """, (rs, i) -> new Week(rs.getInt(1), rs.getInt(2), rs.getInt(3),
                rs.getBigDecimal(4), rs.getBigDecimal(5)), depot, brand);
    }

    /**
     * Observed weeks for the whole depot, summed across brands, oldest first. The forecast rows are
     * a depot total, so the observed rows beside them must be too.
     */
    public List<Week> depotSeries(String depot) {
        return db.query("""
            SELECT iso_year, iso_week, max(operating_days) AS operating_days,
                   sum(total_volume_m3) AS total_volume_m3, sum(chilled_volume_m3) AS chilled_volume_m3
              FROM demand_history_week
             WHERE depot = ?
             GROUP BY iso_year, iso_week
             ORDER BY iso_year, iso_week
            """, (rs, i) -> new Week(rs.getInt(1), rs.getInt(2), rs.getInt(3),
                rs.getBigDecimal(4), rs.getBigDecimal(5)), depot);
    }

    public List<String> brands(String depot) {
        return db.queryForList("SELECT DISTINCT brand FROM demand_history_week WHERE depot = ? ORDER BY brand",
            String.class, depot);
    }

    /** Operating days per ISO week from the seeded calendar, so future weeks convert honestly. */
    public List<Week> calendarWeeks(int fromIsoYear, int fromIsoWeek, int limit) {
        return db.query("""
            SELECT iso_year, iso_week, count(*) FILTER (WHERE is_operating) AS operating_days
              FROM calendar_day
             WHERE (iso_year, iso_week) >= (?, ?)
             GROUP BY iso_year, iso_week
            HAVING count(*) FILTER (WHERE is_operating) > 0
             ORDER BY iso_year, iso_week
             LIMIT ?
            """, (rs, i) -> new Week(rs.getInt(1), rs.getInt(2), rs.getInt(3), null, null),
            fromIsoYear, fromIsoWeek, limit);
    }
}
