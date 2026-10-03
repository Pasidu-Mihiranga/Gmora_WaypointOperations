package lk.techtrithalon.waypoint.ordering.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;

/** The totals the server would record for a basket, so the browser shows exactly what will be saved. */
@Schema(name = "OrderPreview")
public record OrderPreview(int units, int items, BigDecimal weightKg, BigDecimal volumeM3) {}
