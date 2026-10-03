package lk.techtrithalon.waypoint.ordering.api;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record PlaceOrderRequest(
    @NotBlank String tempRequirement,
    @Min(1) @Max(100_000) @Schema(description = "Required unless lines are sent; with lines it is worked out from them") Integer units,
    @DecimalMax("99999999.99") @DecimalMin(value = "0.01", inclusive = true) @Schema(description = "Required unless lines are sent") BigDecimal weightKg,
    @DecimalMax("9999999.999") @DecimalMin(value = "0.001", inclusive = true) @Schema(description = "Required unless lines are sent") BigDecimal volumeM3,
    LocalDate expectedDeliveryDate,
    @Valid @Schema(description = "Catalog items and quantities. When present the server sizes the order from them.") List<Line> lines
) {
    public record Line(@NotNull Long productId, @NotNull @Min(1) @Max(100_000) Integer quantity) {}
}
