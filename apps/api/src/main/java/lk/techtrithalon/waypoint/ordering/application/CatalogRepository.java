package lk.techtrithalon.waypoint.ordering.application;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import lk.techtrithalon.waypoint.ordering.domain.OrderLine;

public interface CatalogRepository {
    /** An active catalog item with the group it belongs to and the relative size factors. */
    record Product(long id, long categoryId, String categoryName, int categorySort, String brand, String tempRequirement,
                   String name, BigDecimal weightFactor, BigDecimal volumeFactor, int sort) {}

    List<Product> activeProducts(String brand, String tempRequirement);

    List<Product> productsByIds(Collection<Long> ids);

    void insertLines(long orderId, List<OrderLine> lines);

    List<OrderLine> lines(long orderId);
}
