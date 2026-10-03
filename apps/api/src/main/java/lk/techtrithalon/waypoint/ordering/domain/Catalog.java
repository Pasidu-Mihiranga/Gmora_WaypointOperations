package lk.techtrithalon.waypoint.ordering.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/**
 * The items a store manager can order for one temperature. The catalog is synthetic (the dataset has no product
 * data); each item's weight and volume per unit is its relative size applied to the dataset's own average for the
 * outlet's brand and temperature. Nothing here is a price.
 */
@Schema(name = "Catalog")
public record Catalog(
    String tempRequirement,
    @Schema(description = "Whether this outlet may place orders of this temperature") boolean allowed,
    @Schema(description = "Whether this outlet may place chilled orders at all") boolean chilledAllowed,
    @Schema(description = "False when there are no past orders to size the items from") boolean sized,
    @Schema(description = "How many past orders the sizes are based on") long basisOrders,
    LocalDate deliveryDate,
    LocalTime windowOpen,
    LocalTime windowClose,
    List<Category> categories,
    List<Item> items
) {
    @Schema(name = "CatalogCategory")
    public record Category(long id, String name) {}

    @Schema(name = "CatalogItem")
    public record Item(long id, long categoryId, String categoryName, String name,
                       @Schema(nullable = true) BigDecimal weightKgPerUnit, @Schema(nullable = true) BigDecimal volumeM3PerUnit) {}
}
