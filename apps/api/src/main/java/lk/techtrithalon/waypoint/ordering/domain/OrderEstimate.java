package lk.techtrithalon.waypoint.ordering.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;

/**
 * What the store manager sees while preparing an order: the delivery day and window, whether the outlet may
 * order this temperature, and a weight and volume worked out from the outlet brand's past orders of that
 * temperature. The estimate is a starting point; the manager can change it before confirming.
 */
@Schema(name = "OrderEstimate")
public record OrderEstimate(
    String tempRequirement,
    int units,
    @Schema(description = "Whether this outlet may place orders of this temperature") boolean allowed,
    @Schema(description = "Whether this outlet may place chilled orders at all") boolean chilledAllowed,
    @Schema(nullable = true, description = "Null when there are no past orders to estimate from") BigDecimal weightKg,
    @Schema(nullable = true) BigDecimal volumeM3,
    @Schema(description = "How many past orders the estimate is based on") long basisOrders,
    LocalDate deliveryDate,
    LocalTime windowOpen,
    LocalTime windowClose
) {}
