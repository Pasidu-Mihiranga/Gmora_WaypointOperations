package lk.techtrithalon.waypoint.ordering.api;

import java.time.LocalDate;
import java.util.List;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.ordering.application.OrderCommandService;
import lk.techtrithalon.waypoint.ordering.application.OrderQueryService;
import lk.techtrithalon.waypoint.ordering.application.CatalogService;
import lk.techtrithalon.waypoint.ordering.domain.Catalog;
import lk.techtrithalon.waypoint.ordering.domain.CutoffInfo;
import lk.techtrithalon.waypoint.ordering.domain.CustomerOrder;
import lk.techtrithalon.waypoint.ordering.domain.OrderEstimate;
import lk.techtrithalon.waypoint.ordering.domain.OrderLine;
import lk.techtrithalon.waypoint.ordering.domain.OrderPreview;
import lk.techtrithalon.waypoint.ordering.domain.OrderPage;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/store")
@SecurityRequirement(name = "session")
class StoreOrderController {
    private final OrderQueryService queries;
    private final OrderCommandService commands;
    private final CatalogService catalogs;

    StoreOrderController(OrderQueryService queries, OrderCommandService commands, CatalogService catalogs) {
        this.queries = queries;
        this.commands = commands;
        this.catalogs = catalogs;
    }

    @GetMapping("/cutoff")
    CutoffInfo cutoff(@AuthenticationPrincipal CurrentUser user) {
        return queries.cutoff(user);
    }

    @GetMapping("/catalog")
    Catalog catalog(@AuthenticationPrincipal CurrentUser user, @RequestParam String temp) {
        return catalogs.catalog(user, temp);
    }

    @PostMapping("/order-preview")
    OrderPreview preview(@AuthenticationPrincipal CurrentUser user, @Valid @RequestBody PreviewOrderRequest request) {
        return catalogs.preview(user, request.tempRequirement(),
            request.lines().stream().map(line -> new CatalogService.LineRequest(line.productId(), line.quantity())).toList());
    }

    @GetMapping("/orders/{id}/lines")
    List<OrderLine> lines(@AuthenticationPrincipal CurrentUser user, @PathVariable long id) {
        return catalogs.lines(user, id);
    }

    @GetMapping("/order-estimate")
    OrderEstimate estimate(@AuthenticationPrincipal CurrentUser user, @RequestParam String temp, @RequestParam int units) {
        return queries.estimate(user, temp, units);
    }

    @GetMapping("/orders")
    OrderPage orders(
        @AuthenticationPrincipal CurrentUser user,
        @RequestParam(required = false) LocalDate date,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String q,
        @RequestParam(defaultValue = "orderDate") String sort,
        @RequestParam(defaultValue = "false") boolean asc,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "50") int size
    ) {
        return queries.storeOrders(user, date, status, q, sort, asc, page, size);
    }

    @GetMapping("/orders/{id}")
    CustomerOrder order(@AuthenticationPrincipal CurrentUser user, @PathVariable long id) {
        return queries.storeOrder(user, id);
    }

    @PostMapping("/orders")
    @ResponseStatus(HttpStatus.CREATED)
    CustomerOrder place(
        @AuthenticationPrincipal CurrentUser user,
        @Valid @RequestBody PlaceOrderRequest request
    ) {
        var lines = request.lines() == null ? null
            : request.lines().stream().map(line -> new CatalogService.LineRequest(line.productId(), line.quantity())).toList();
        return commands.placeConfirmed(
            user, request.tempRequirement(), request.units(), request.weightKg(), request.volumeM3(), request.expectedDeliveryDate(), lines
        );
    }
}
