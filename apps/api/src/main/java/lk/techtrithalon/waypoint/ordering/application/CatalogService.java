package lk.techtrithalon.waypoint.ordering.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.ordering.domain.Catalog;
import lk.techtrithalon.waypoint.ordering.domain.OrderLine;
import lk.techtrithalon.waypoint.ordering.domain.OrderPreview;
import lk.techtrithalon.waypoint.reference.application.ReferenceService;
import lk.techtrithalon.waypoint.reference.domain.Outlet;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The store manager's catalog and the sizing of an order built from it. Weight and volume per unit are the
 * dataset's average for the outlet's brand and temperature, scaled by each item's relative size, so a basket of
 * items adds up to a realistic order total. Planning, loading and delivery keep working from those totals.
 */
@Service
public class CatalogService {
    private static final int MAX_QUANTITY = 100_000;

    private final CatalogRepository catalog;
    private final OrderRepository orders;
    private final ReferenceService reference;
    private final DeliveryDateService deliveryDates;
    private final OrderQueryService orderQueries;

    public CatalogService(CatalogRepository catalog, OrderRepository orders, ReferenceService reference, DeliveryDateService deliveryDates,
                          OrderQueryService orderQueries) {
        this.catalog = catalog; this.orders = orders; this.reference = reference; this.deliveryDates = deliveryDates; this.orderQueries = orderQueries;
    }

    /** What was asked for: an item and how many. */
    public record LineRequest(Long productId, Integer quantity) {}

    /** The order totals worked out from the lines, and the lines to save. */
    public record Sized(int units, BigDecimal weightKg, BigDecimal volumeM3, List<OrderLine> lines) {}

    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('STORE_MANAGER')")
    public Catalog catalog(CurrentUser user, String tempRequirement) {
        if (user.outletId() == null) throw missing();
        String temp = temp(tempRequirement);
        Outlet outlet = reference.outlet(user, user.outletId());
        var footprint = orders.typicalFootprint(outlet.brand(), temp);
        var products = catalog.activeProducts(outlet.brand(), temp);
        Map<Long, Catalog.Category> categories = new LinkedHashMap<>();
        List<Catalog.Item> items = new ArrayList<>();
        for (var p : products) {
            categories.putIfAbsent(p.categoryId(), new Catalog.Category(p.categoryId(), p.categoryName()));
            items.add(new Catalog.Item(p.id(), p.categoryId(), p.categoryName(), p.name(),
                footprint.map(f -> f.weightKgPerUnit().multiply(p.weightFactor()).setScale(3, RoundingMode.HALF_UP)).orElse(null),
                footprint.map(f -> f.volumeM3PerUnit().multiply(p.volumeFactor()).setScale(5, RoundingMode.HALF_UP)).orElse(null)));
        }
        var info = deliveryDates.cutoffInfo();
        return new Catalog(temp, OrderRules.mayOrder(outlet.brand(), temp), OrderRules.mayOrder(outlet.brand(), "chilled"), footprint.isPresent(),
            footprint.map(OrderRepository.Footprint::orders).orElse(0L), info.nextDeliveryDate(), outlet.effectiveWindowOpen(),
            outlet.effectiveWindowClose(), List.copyOf(categories.values()), items);
    }

    /** Checks the lines against the outlet's catalog and totals them. Throws a 4xx the store can act on. */
    Sized size(Outlet outlet, String temp, List<LineRequest> requested) {
        var seen = new HashSet<Long>();
        for (var line : requested) {
            if (line == null || line.productId() == null) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PRODUCT", "Each line needs a product");
            if (line.quantity() == null || line.quantity() < 1 || line.quantity() > MAX_QUANTITY)
                throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_QUANTITY", "Quantity must be between 1 and " + MAX_QUANTITY);
            if (!seen.add(line.productId())) throw new ApiException(HttpStatus.BAD_REQUEST, "DUPLICATE_PRODUCT", "List each product once");
        }
        Map<Long, CatalogRepository.Product> products = new LinkedHashMap<>();
        catalog.productsByIds(seen).forEach(p -> products.put(p.id(), p));
        List<OrderLine> lines = new ArrayList<>();
        for (var line : requested) {
            var p = products.get(line.productId());
            if (p == null || !p.brand().equals(outlet.brand()) || !p.tempRequirement().equals(temp))
                throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "PRODUCT_NOT_AVAILABLE", "An item is not available to this outlet for " + ("ambient".equals(temp) ? "an ambient" : "a chilled") + " order");
            lines.add(new OrderLine(p.id(), p.name(), p.categoryName(), line.quantity()));
        }
        var footprint = orders.typicalFootprint(outlet.brand(), temp).orElseThrow(() -> new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,
            "CATALOG_UNAVAILABLE", "There are no past orders to size this catalog from. Order by units instead."));
        int units = 0;
        BigDecimal weight = BigDecimal.ZERO, volume = BigDecimal.ZERO;
        for (var line : requested) {
            var p = products.get(line.productId());
            BigDecimal quantity = BigDecimal.valueOf(line.quantity());
            units += line.quantity();
            weight = weight.add(footprint.weightKgPerUnit().multiply(p.weightFactor()).multiply(quantity));
            volume = volume.add(footprint.volumeM3PerUnit().multiply(p.volumeFactor()).multiply(quantity));
        }
        return new Sized(units, weight.setScale(2, RoundingMode.HALF_UP), volume.setScale(3, RoundingMode.HALF_UP), lines);
    }

    /** Totals for a basket, worked out by the same code that sizes a submitted order. */
    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('STORE_MANAGER')")
    public OrderPreview preview(CurrentUser user, String tempRequirement, List<LineRequest> lines) {
        if (user.outletId() == null) throw missing();
        String temp = temp(tempRequirement);
        Outlet outlet = reference.outlet(user, user.outletId());
        if (!OrderRules.mayOrder(outlet.brand(), temp))
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "CHILLED_FRESH_ONLY", "Only Fresh outlets may place chilled orders");
        if (lines == null || lines.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_UNITS", "Add at least one item");
        var sized = size(outlet, temp, lines);
        return new OrderPreview(sized.units(), sized.lines().size(), sized.weightKg(), sized.volumeM3());
    }

    void saveLines(long orderId, List<OrderLine> lines) {
        catalog.insertLines(orderId, lines);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('STORE_MANAGER')")
    public List<OrderLine> lines(CurrentUser user, long orderId) {
        orderQueries.storeOrder(user, orderId);   // 404 for another outlet's order
        return catalog.lines(orderId);
    }

    private static String temp(String tempRequirement) {
        String temp = tempRequirement == null ? "" : tempRequirement.trim().toLowerCase();
        if (!"ambient".equals(temp) && !"chilled".equals(temp)) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_TEMP", "Use ambient or chilled");
        return temp;
    }

    private static ApiException missing() { return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found"); }
}
