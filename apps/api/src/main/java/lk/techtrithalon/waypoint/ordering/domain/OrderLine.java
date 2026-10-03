package lk.techtrithalon.waypoint.ordering.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** One item and quantity saved with an order. The names are copied at ordering time. */
@Schema(name = "OrderLine")
public record OrderLine(long productId, String productName, String categoryName, int quantity) {}
