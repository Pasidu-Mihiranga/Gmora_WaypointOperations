package lk.techtrithalon.waypoint.forecast.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import lk.techtrithalon.waypoint.reference.infrastructure.ReferenceApiTestSupport;
import org.junit.jupiter.api.Test;

/**
 * The synthetic calendar fixture holds only two ISO weeks, so the seeded state has no history and
 * the endpoint must say so. Weekly rows inserted here are invented values, not dataset values.
 */
class ForecastReadIT extends ReferenceApiTestSupport {
    private static final String PATH = "/api/v1/dispatcher/forecast/demand";

    /** 13 completed weeks ending before the fixture calendar's week 26, so week 26 starts the horizon.
     *  Six of them are echoed back as the observed tail, so index 6 is the first projected week. */
    private void seedSeries(String depot, String brand, double total, double chilled) {
        for (int week = 13; week <= 25; week++) {
            db.update("""
                INSERT INTO demand_history_week (depot, brand, iso_year, iso_week, operating_days,
                  order_count, total_volume_m3, chilled_volume_m3) VALUES (?, ?, 2026, ?, 6, 10, ?, ?)
                """, depot, brand, week, total, chilled);
        }
    }

    @Test
    void reportsAnHonestUnavailableStateWhenNoHistoryHasBeenAggregated() throws Exception {
        Cookie cookie = login("DSP-001", "synthetic-dispatcher-password");
        mvc.perform(get(PATH + "?depot=Peliyagoda").cookie(cookie))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.depot").value("Peliyagoda"))
            .andExpect(jsonPath("$.advisory").value(true))
            .andExpect(jsonPath("$.method").value("moving_average"))
            .andExpect(jsonPath("$.methodVersion").value("13w.1"))
            .andExpect(jsonPath("$.series.length()").value(0))
            .andExpect(jsonPath("$.weeks.length()").value(0))
            // Capacity is still reported as a plain fact, with no verdict attached.
            .andExpect(jsonPath("$.capacity.vehicles").value(1))
            .andExpect(jsonPath("$.capacity.reeferVehicles").value(1));
    }

    @Test
    void projectsTheBaselinePerBrandAndConvertsUsingRealOperatingDays() throws Exception {
        seedSeries("Peliyagoda", "Fresh", 600, 220);
        seedSeries("Peliyagoda", "Tech", 60, 0);
        Cookie cookie = login("DSP-001", "synthetic-dispatcher-password");
        mvc.perform(get(PATH + "?depot=Peliyagoda&horizonWeeks=2").cookie(cookie))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.windowWeeks").value(13))
            .andExpect(jsonPath("$.generatedAt").exists())
            .andExpect(jsonPath("$.series.length()").value(2))
            // Brands are reported separately because the history differs sharply between them.
            .andExpect(jsonPath("$.series[0].brand").value("Fresh"))
            .andExpect(jsonPath("$.series[0].confidence").value("high"))
            .andExpect(jsonPath("$.series[0].chilledApplicable").value(true))
            .andExpect(jsonPath("$.series[0].sampleWeeks").value(13))
            .andExpect(jsonPath("$.series[0].forecastTotalM3").value(600.0))
            // A brand with no chilled history stays at zero rather than being given noise.
            .andExpect(jsonPath("$.series[1].brand").value("Tech"))
            .andExpect(jsonPath("$.series[1].confidence").value("low"))
            .andExpect(jsonPath("$.series[1].chilledApplicable").value(false))
            .andExpect(jsonPath("$.series[1].forecastChilledM3").value(0.0))
            // Observed weeks are flagged and carry no forecast; future weeks are the reverse.
            .andExpect(jsonPath("$.weeks[0].observed").value(true))
            .andExpect(jsonPath("$.weeks[0].forecastTotalM3").doesNotExist())
            .andExpect(jsonPath("$.weeks[0].observedTotalM3").value(660.0))
            .andExpect(jsonPath("$.weeks[6].observed").value(false))
            .andExpect(jsonPath("$.weeks[6].isoWeek").value(26))
            .andExpect(jsonPath("$.weeks[6].observedTotalM3").doesNotExist())
            .andExpect(jsonPath("$.weeks[6].forecastTotalM3").value(660.0))
            // Week 26 of the fixture calendar has two operating days, so 660 / 2 = 330 per day.
            .andExpect(jsonPath("$.weeks[6].operatingDays").value(2))
            .andExpect(jsonPath("$.weeks[6].forecastTotalPerDayM3").value(330.0));
    }

    @Test
    void refusesUnknownDepotsInvalidHorizonsAnonymousCallersAndOtherRoles() throws Exception {
        Cookie cookie = login("DSP-001", "synthetic-dispatcher-password");
        failure(mvc.perform(get(PATH + "?depot=UNKNOWN").cookie(cookie)).andReturn(), 404, "NOT_FOUND");
        failure(mvc.perform(get(PATH + "?depot=Peliyagoda&horizonWeeks=0").cookie(cookie)).andReturn(),
            400, "INVALID_HORIZON");
        failure(mvc.perform(get(PATH + "?depot=Peliyagoda&horizonWeeks=27").cookie(cookie)).andReturn(),
            400, "INVALID_HORIZON");
        failure(mvc.perform(get(PATH + "?depot=Peliyagoda")).andReturn(), 401, "UNAUTHENTICATED");
        Cookie store = login("STM-001", "synthetic-store-password");
        failure(mvc.perform(get(PATH + "?depot=Peliyagoda").cookie(store)).andReturn(), 403, "FORBIDDEN");

        // A depot-scoped dispatcher may not read the other depot's outlook.
        db.update("UPDATE app_user SET depot='Peliyagoda' WHERE username='DSP-001'");
        try {
            Cookie scoped = login("DSP-001", "synthetic-dispatcher-password");
            failure(mvc.perform(get(PATH + "?depot=Kandy").cookie(scoped)).andReturn(), 404, "NOT_FOUND");
        } finally {
            db.update("UPDATE app_user SET depot=NULL WHERE username='DSP-001'");
        }
    }
}
