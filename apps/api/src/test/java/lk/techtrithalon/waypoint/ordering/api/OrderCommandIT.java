package lk.techtrithalon.waypoint.ordering.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Map;
import lk.techtrithalon.waypoint.reference.infrastructure.ReferenceApiTestSupport;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.web.servlet.MvcResult;

@Import(OrderCommandIT.ClockConfig.class)
class OrderCommandIT extends ReferenceApiTestSupport {
    @Autowired MutableClock clock;

    @BeforeEach
    void beforeCutoffOnThursday() {
        // 2026-06-25 10:00 Asia/Colombo — before 16:00, next operating day is Fri 26.
        clock.instant = Instant.parse("2026-06-25T04:30:00Z");
        db.update("DELETE FROM audit_event WHERE type='order.confirmed'");
        db.update("DELETE FROM customer_order WHERE ref LIKE 'ORD-%'");
    }

    /** The orders these tests place must not leak into the planning and receipt tests that share the database. */
    @AfterEach
    void removeOrdersPlacedByTheTest() {
        db.update("DELETE FROM audit_event WHERE type='order.confirmed'");
        db.update("DELETE FROM customer_order WHERE ref LIKE 'ORD-%' OR ref LIKE 'HIST%'");
    }

    /** A synthetic past ambient order, so the catalog has an average to size its items from. */
    private void seedAmbientHistory() {
        db.update("""
            INSERT INTO customer_order(ref,outlet_id,brand,depot,district,order_date,placed_at,confirmed_at,temp_requirement,
              units,weight_kg,volume_m3,status,iso_year,iso_week,version,updated_at)
            SELECT 'HIST001','OUT901','Fresh','Peliyagoda','Alpha',DATE '2026-06-28',now(),now(),'ambient',10,70.00,0.400,'delivered',2026,26,0,now()
            WHERE NOT EXISTS (SELECT 1 FROM customer_order WHERE ref='HIST001')""");
    }

    @Test
    void storeManagerConfirmsOrderForNextOperatingDay() throws Exception {
        Cookie store = login("STM-001", "synthetic-store-password");
        MvcResult created = mvc.perform(post("/api/v1/store/orders").cookie(store)
            .header("X-Requested-With", "Waypoint")
            .contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "tempRequirement", "ambient",
                "units", 10,
                "weightKg", 75.5,
                "volumeM3", 0.42
            )))).andReturn();
        assertThat(created.getResponse().getStatus()).isEqualTo(201);
        var body = mapper.readTree(created.getResponse().getContentAsString());
        assertThat(body.path("status").asText()).isEqualTo("confirmed");
        assertThat(body.path("orderDate").asText()).isEqualTo("2026-06-26");
        assertThat(body.path("outletId").asText()).isEqualTo("OUT901");
        assertThat(body.path("ref").asText()).startsWith("ORD-");
        assertThat(body.path("placedBy").asLong())
            .isEqualTo(db.queryForObject("SELECT id FROM app_user WHERE username='STM-001'", Long.class));
        assertThat(db.queryForObject(
            "SELECT count(*) FROM audit_event WHERE type='order.confirmed' AND entity_id=?",
            Integer.class, body.path("id").asText())).isEqualTo(1);
    }

    @Test
    void afterCutoffRollsToFollowingOperatingDayAndFreshMayPlaceBothTemps() throws Exception {
        clock.instant = Instant.parse("2026-06-25T11:00:00Z"); // 16:30 Colombo
        Cookie store = login("STM-001", "synthetic-store-password");
        mvc.perform(post("/api/v1/store/orders").cookie(store)
            .header("X-Requested-With", "Waypoint")
            .contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "tempRequirement", "ambient", "units", 4, "weightKg", 28.0, "volumeM3", 0.15
            ))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.orderDate").value("2026-06-27"));
        mvc.perform(post("/api/v1/store/orders").cookie(store)
            .header("X-Requested-With", "Waypoint")
            .contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "tempRequirement", "chilled", "units", 5, "weightKg", 35.0, "volumeM3", 0.2
            ))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.tempRequirement").value("chilled"))
            .andExpect(jsonPath("$.orderDate").value("2026-06-27"));
    }

    @Test
    void rejectsBadQuantitiesDuplicateTempNonFreshChilledAndWrongRole() throws Exception {
        Cookie store = login("STM-001", "synthetic-store-password");
        Cookie dispatcher = login("DSP-001", "synthetic-dispatcher-password");
        failure(mvc.perform(post("/api/v1/store/orders").cookie(store)
            .header("X-Requested-With", "Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "tempRequirement", "ambient", "units", 0, "weightKg", 10, "volumeM3", 0.1
            )))).andReturn(), 400, "VALIDATION_FAILED");
        failure(mvc.perform(post("/api/v1/store/orders").cookie(dispatcher)
            .header("X-Requested-With", "Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "tempRequirement", "ambient", "units", 2, "weightKg", 10, "volumeM3", 0.1
            )))).andReturn(), 403, "FORBIDDEN");

        mvc.perform(post("/api/v1/store/orders").cookie(store)
            .header("X-Requested-With", "Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "tempRequirement", "ambient", "units", 2, "weightKg", 10, "volumeM3", 0.1
            )))).andExpect(status().isCreated());
        failure(mvc.perform(post("/api/v1/store/orders").cookie(store)
            .header("X-Requested-With", "Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "tempRequirement", "ambient", "units", 3, "weightKg", 12, "volumeM3", 0.12
            )))).andReturn(), 409, "DUPLICATE_TEMP_ORDER");

        db.update("UPDATE outlet SET brand='Style' WHERE outlet_id='OUT901'");
        try {
            failure(mvc.perform(post("/api/v1/store/orders").cookie(store)
                .header("X-Requested-With", "Waypoint").contentType("application/json")
                .content(mapper.writeValueAsString(Map.of(
                    "tempRequirement", "chilled", "units", 2, "weightKg", 10, "volumeM3", 0.1
                )))).andReturn(), 422, "CHILLED_FRESH_ONLY");
        } finally {
            db.update("UPDATE outlet SET brand='Fresh' WHERE outlet_id='OUT901'");
        }
    }

    @Test
    void sundayHolidayAnchorSkipsToNextOperatingDay() throws Exception {
        // Saturday 27 after cutoff → anchor Sunday 28 → first operating after 28 is Monday 29.
        clock.instant = Instant.parse("2026-06-27T11:00:00Z");
        Cookie store = login("STM-001", "synthetic-store-password");
        mvc.perform(post("/api/v1/store/orders").cookie(store)
            .header("X-Requested-With", "Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "tempRequirement", "ambient", "units", 2, "weightKg", 10, "volumeM3", 0.1
            ))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.orderDate").value("2026-06-29"));
    }

    @Test
    void concurrentConfirmationsPersistExactlyOneOrderAndAudit() throws Exception {
        Cookie store = login("STM-001", "synthetic-store-password");
        var start = new java.util.concurrent.CountDownLatch(1);
        var pool = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            var calls = java.util.stream.IntStream.range(0, 2).mapToObj(i -> pool.submit(() -> {
                start.await();
                return mvc.perform(post("/api/v1/store/orders").cookie(store)
                    .header("X-Requested-With", "Waypoint").contentType("application/json")
                    .content("{\"tempRequirement\":\"ambient\",\"units\":2,\"weightKg\":10,\"volumeM3\":0.1}"))
                    .andReturn();
            })).toList();
            start.countDown();
            var responses = new java.util.ArrayList<MvcResult>();
            for (var call : calls) responses.add(call.get(15, java.util.concurrent.TimeUnit.SECONDS));
            assertThat(responses.stream().map(r -> r.getResponse().getStatus())).containsExactlyInAnyOrder(201, 409);
            for (var response : responses) if (response.getResponse().getStatus() == 409)
                failure(response, 409, "DUPLICATE_TEMP_ORDER");
            assertThat(db.queryForObject("SELECT count(*) FROM customer_order WHERE outlet_id='OUT901' AND order_date='2026-06-26' AND temp_requirement='ambient'", Integer.class)).isEqualTo(1);
            assertThat(db.queryForObject("SELECT count(*) FROM audit_event WHERE type='order.confirmed'", Integer.class)).isEqualTo(1);
        } finally { pool.shutdownNow(); }
    }

    @Test
    void refusesAChangedReviewedDateAndAnExhaustedCalendar() throws Exception {
        Cookie store = login("STM-001", "synthetic-store-password");
        clock.instant = Instant.parse("2026-06-25T10:30:00Z");
        failure(mvc.perform(post("/api/v1/store/orders").cookie(store)
            .header("X-Requested-With", "Waypoint").contentType("application/json")
            .content("{\"tempRequirement\":\"ambient\",\"units\":2,\"weightKg\":10,\"volumeM3\":0.1,\"expectedDeliveryDate\":\"2026-06-26\"}"))
            .andReturn(), 409, "DELIVERY_DATE_CHANGED");
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event WHERE type='order.confirmed'", Integer.class)).isZero();
        clock.instant = Instant.parse("2026-10-02T04:00:00Z");
        // Restore a live session at the new time rather than testing session expiry here.
        store = login("STM-001", "synthetic-store-password");
        failure(mvc.perform(post("/api/v1/store/orders").cookie(store)
            .header("X-Requested-With", "Waypoint").contentType("application/json")
            .content("{\"tempRequirement\":\"ambient\",\"units\":2,\"weightKg\":10,\"volumeM3\":0.1}"))
            .andReturn(), 422, "NO_OPERATING_DAY");
    }

    static class MutableClock extends Clock {
        Instant instant = Instant.parse("2026-06-25T04:30:00Z");
        @Override public ZoneId getZone() { return ZoneId.of("Asia/Colombo"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return instant; }
    }

    @Test
    void estimateComesFromPastOrdersOfTheSameBrandAndTemperatureAndNothingIsInvented() throws Exception {
        Cookie store = login("STM-001", "synthetic-store-password");
        mvc.perform(post("/api/v1/store/orders").cookie(store).header("X-Requested-With", "Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(Map.of("tempRequirement", "ambient", "units", 10, "weightKg", 75.5, "volumeM3", 0.42)))).andReturn();

        var estimate = getJson(store, "/api/v1/store/order-estimate?temp=ambient&units=20");
        double kgPerUnit = db.queryForObject("SELECT sum(weight_kg)/sum(units) FROM customer_order WHERE brand='Fresh' AND temp_requirement='ambient' AND units>0 AND status<>'cancelled'", Double.class);
        double m3PerUnit = db.queryForObject("SELECT sum(volume_m3)/sum(units) FROM customer_order WHERE brand='Fresh' AND temp_requirement='ambient' AND units>0 AND status<>'cancelled'", Double.class);
        long basis = db.queryForObject("SELECT count(*) FROM customer_order WHERE brand='Fresh' AND temp_requirement='ambient' AND units>0 AND status<>'cancelled'", Long.class);
        assertThat(estimate.path("weightKg").asDouble()).isCloseTo(kgPerUnit * 20, org.assertj.core.data.Offset.offset(0.011));
        assertThat(estimate.path("volumeM3").asDouble()).isCloseTo(m3PerUnit * 20, org.assertj.core.data.Offset.offset(0.0011));
        assertThat(estimate.path("basisOrders").asLong()).isEqualTo(basis);
        assertThat(estimate.path("allowed").asBoolean()).isTrue();
        assertThat(estimate.path("chilledAllowed").asBoolean()).isTrue();          // OUT901 is a Fresh outlet
        assertThat(estimate.path("deliveryDate").asText()).isEqualTo("2026-06-26");
        assertThat(estimate.path("windowOpen").asText()).isNotBlank();
        assertThat(getJson(store, "/api/v1/store/order-estimate?temp=ambient&units=40").path("weightKg").asDouble())
            .isGreaterThan(estimate.path("weightKg").asDouble());                  // scales with the units entered

        failure(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/store/order-estimate?temp=frozen&units=2").cookie(store)).andReturn(), 400, "INVALID_TEMP");
        failure(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/store/order-estimate?temp=ambient&units=0").cookie(store)).andReturn(), 400, "INVALID_UNITS");
        failure(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/store/order-estimate?temp=ambient&units=2")).andReturn(), 401, "UNAUTHENTICATED");
        Cookie dispatcher = login("DSP-001", "synthetic-dispatcher-password");
        failure(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/store/order-estimate?temp=ambient&units=2").cookie(dispatcher)).andReturn(), 403, "FORBIDDEN");
    }

    private long productId(String name, String temp) {
        return db.queryForObject("""
            SELECT p.id FROM product p JOIN product_category c ON c.id=p.category_id
            WHERE p.name=? AND c.brand='Fresh' AND c.temp_requirement=?""", Long.class, name, temp);
    }

    @Test
    void catalogItemsAreSizedFromTheDatasetAverageForTheBrandAndTemperature() throws Exception {
        seedAmbientHistory();
        Cookie store = login("STM-001", "synthetic-store-password");
        var ambient = getJson(store, "/api/v1/store/catalog?temp=ambient");
        assertThat(ambient.path("allowed").asBoolean()).isTrue();
        assertThat(ambient.path("sized").asBoolean()).isTrue();
        assertThat(ambient.path("categories").size()).isEqualTo(4);                  // Pantry, Bakery, Beverages, Snacks
        assertThat(ambient.path("categories").get(0).path("name").asText()).isEqualTo("Pantry");
        double kgPerUnit = db.queryForObject("SELECT sum(weight_kg)/sum(units) FROM customer_order WHERE brand='Fresh' AND temp_requirement='ambient' AND units>0 AND status<>'cancelled'", Double.class);
        var rice = java.util.stream.StreamSupport.stream(ambient.path("items").spliterator(), false).filter(i -> "Rice 5kg".equals(i.path("name").asText())).findFirst().orElseThrow();
        assertThat(rice.path("weightKgPerUnit").asDouble()).isCloseTo(kgPerUnit * 5.0, org.assertj.core.data.Offset.offset(0.002));   // relative size 5.0
        var chilled = getJson(store, "/api/v1/store/catalog?temp=chilled");
        assertThat(chilled.path("categories").size()).isEqualTo(4);                  // Dairy & Chilled, Bakery, Beverages, Frozen
        assertThat(chilled.path("items").size()).isEqualTo(9);
        assertThat(chilled.path("items").get(0).path("categoryName").asText()).isEqualTo("Dairy & Chilled");

        failure(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/store/catalog?temp=frozen").cookie(store)).andReturn(), 400, "INVALID_TEMP");
        failure(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/store/catalog?temp=ambient")).andReturn(), 401, "UNAUTHENTICATED");
        failure(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/store/catalog?temp=ambient").cookie(login("DSP-001", "synthetic-dispatcher-password"))).andReturn(), 403, "FORBIDDEN");
    }

    @Test
    void anOrderBuiltFromCatalogLinesIsSizedByTheServerAndKeepsItsLines() throws Exception {
        seedAmbientHistory();
        Cookie store = login("STM-001", "synthetic-store-password");
        long rice = productId("Rice 5kg", "ambient"), tea = productId("Tea Bags 100ct", "ambient");
        // Weight and volume sent by the client are ignored when lines are present.
        MvcResult created = mvc.perform(post("/api/v1/store/orders").cookie(store).header("X-Requested-With", "Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(Map.of("tempRequirement", "ambient", "units", 999, "weightKg", 1, "volumeM3", 0.001,
                "lines", java.util.List.of(Map.of("productId", rice, "quantity", 2), Map.of("productId", tea, "quantity", 4)))))).andReturn();
        assertThat(created.getResponse().getStatus()).isEqualTo(201);
        var order = mapper.readTree(created.getResponse().getContentAsString());
        assertThat(order.path("units").asInt()).isEqualTo(6);
        double kgPerUnit = db.queryForObject("SELECT sum(weight_kg)/sum(units) FROM customer_order WHERE brand='Fresh' AND temp_requirement='ambient' AND units>0 AND status<>'cancelled' AND ref NOT LIKE 'ORD-%'", Double.class);
        double m3PerUnit = db.queryForObject("SELECT sum(volume_m3)/sum(units) FROM customer_order WHERE brand='Fresh' AND temp_requirement='ambient' AND units>0 AND status<>'cancelled' AND ref NOT LIKE 'ORD-%'", Double.class);
        assertThat(order.path("weightKg").asDouble()).isCloseTo(kgPerUnit * (5.0 * 2 + 0.25 * 4), org.assertj.core.data.Offset.offset(0.011));
        assertThat(order.path("volumeM3").asDouble()).isCloseTo(m3PerUnit * (2.5 * 2 + 0.6 * 4), org.assertj.core.data.Offset.offset(0.0011));

        var lines = getJson(store, "/api/v1/store/orders/" + order.path("id").asLong() + "/lines");
        assertThat(lines.size()).isEqualTo(2);
        assertThat(lines.get(0).path("productName").asText()).isEqualTo("Rice 5kg");
        assertThat(lines.get(0).path("categoryName").asText()).isEqualTo("Pantry");
        assertThat(lines.get(0).path("quantity").asInt()).isEqualTo(2);
        failure(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/store/orders/999999999/lines").cookie(store)).andReturn(), 404, "NOT_FOUND");
    }

    @Test
    void thePreviewTotalsAreExactlyWhatTheSubmittedOrderRecords() throws Exception {
        seedAmbientHistory();
        Cookie store = login("STM-001", "synthetic-store-password");
        long rice = productId("Rice 5kg", "ambient"), salt = productId("Salt 1kg", "ambient");
        var body = Map.of("tempRequirement", "ambient", "lines", java.util.List.of(Map.of("productId", rice, "quantity", 3), Map.of("productId", salt, "quantity", 7)));
        MvcResult preview = mvc.perform(post("/api/v1/store/order-preview").cookie(store).header("X-Requested-With", "Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(body))).andReturn();
        assertThat(preview.getResponse().getStatus()).isEqualTo(200);
        var shown = mapper.readTree(preview.getResponse().getContentAsString());
        assertThat(shown.path("units").asInt()).isEqualTo(10);
        assertThat(shown.path("items").asInt()).isEqualTo(2);
        assertThat(db.queryForObject("SELECT count(*) FROM customer_order WHERE ref LIKE 'ORD-%'", Integer.class)).isZero();   // a preview saves nothing

        MvcResult placed = mvc.perform(post("/api/v1/store/orders").cookie(store).header("X-Requested-With", "Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(body))).andReturn();
        var saved = mapper.readTree(placed.getResponse().getContentAsString());
        assertThat(saved.path("weightKg").asDouble()).isEqualTo(shown.path("weightKg").asDouble());
        assertThat(saved.path("volumeM3").asDouble()).isEqualTo(shown.path("volumeM3").asDouble());

        failure(mvc.perform(post("/api/v1/store/order-preview").cookie(store).header("X-Requested-With", "Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(Map.of("tempRequirement", "ambient", "lines", java.util.List.of())))).andReturn(), 400, "VALIDATION_FAILED");
        failure(mvc.perform(post("/api/v1/store/order-preview").header("X-Requested-With", "Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(body))).andReturn(), 401, "UNAUTHENTICATED");
    }

    @Test
    void catalogOrdersRefuseBadLinesWithoutCreatingAnything() throws Exception {
        seedAmbientHistory();
        Cookie store = login("STM-001", "synthetic-store-password");
        long rice = productId("Rice 5kg", "ambient"), milk = productId("Full Cream Milk 1L", "chilled");
        record Case(java.util.List<Map<String, Object>> lines, int status, String code) {}
        for (var c : java.util.List.of(
            new Case(java.util.List.of(Map.of("productId", rice, "quantity", 1), Map.of("productId", rice, "quantity", 2)), 400, "DUPLICATE_PRODUCT"),
            new Case(java.util.List.of(Map.of("productId", rice, "quantity", 0)), 400, "VALIDATION_FAILED"),
            new Case(java.util.List.of(Map.of("productId", milk, "quantity", 1)), 422, "PRODUCT_NOT_AVAILABLE"),   // a chilled item in an ambient order
            new Case(java.util.List.of(Map.of("productId", 999999999L, "quantity", 1)), 422, "PRODUCT_NOT_AVAILABLE"))) {
            MvcResult result = mvc.perform(post("/api/v1/store/orders").cookie(store).header("X-Requested-With", "Waypoint").contentType("application/json")
                .content(mapper.writeValueAsString(Map.of("tempRequirement", "ambient", "lines", c.lines())))).andReturn();
            failure(result, c.status(), c.code());
        }
        assertThat(db.queryForObject("SELECT count(*) FROM customer_order WHERE ref LIKE 'ORD-%'", Integer.class)).isZero();
        // Neither lines nor totals is not an order either.
        failure(mvc.perform(post("/api/v1/store/orders").cookie(store).header("X-Requested-With", "Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(Map.of("tempRequirement", "ambient")))).andReturn(), 400, "INVALID_UNITS");
    }

    private com.fasterxml.jackson.databind.JsonNode getJson(Cookie cookie, String path) throws Exception {
        var result = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(path).cookie(cookie)).andReturn();
        assertThat(result.getResponse().getStatus()).as(path).isEqualTo(200);
        return mapper.readTree(result.getResponse().getContentAsString());
    }

    @TestConfiguration
    static class ClockConfig {
        @Bean @Primary MutableClock mutableClock() { return new MutableClock(); }
    }
}
