package lk.techtrithalon.waypoint.receipt.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/** What the store manager's delivery and receipt screens show; every value is computed on the server. */
public final class ReceiptViews {
    private ReceiptViews() {}

    @Schema(name="ReceiptDeliveryList")
    public record DeliveryList(String outletId, List<DeliveryRow> rows) {}

    @Schema(name="ReceiptDeliveryRow")
    public record DeliveryRow(long orderId, String orderRef, LocalDate planDate,
                              @Schema(description="PENDING (planned or loading), IN_DELIVERY or DELIVERED (the driver recorded an outcome)") String phase,
                              @Schema(description="NONE, CONFIRMED, DISPUTED (open) or RESOLVED") String receipt,
                              String tempRequirement, int units,
                              @Schema(nullable=true) LocalTime windowOpen, @Schema(nullable=true) LocalTime windowClose,
                              @Schema(nullable=true) String driverName, @Schema(nullable=true) String vehicleId,
                              @Schema(nullable=true) Integer tripIndex, @Schema(nullable=true) LocalTime plannedArrival,
                              @Schema(nullable=true, description="DELIVERED, PARTIAL or FAILED, once recorded") String outcome,
                              @Schema(nullable=true) Integer deliveredUnits, @Schema(nullable=true) Instant deliveredAt) {}

    @Schema(name="ReceiptDeliveryDetail")
    public record DeliveryDetail(DeliveryRow row, String outletId, String district, String brand, String dockType,
                                 @Schema(nullable=true) String parkingConstraint,
                                 @Schema(description="Order status") String status, int loadedUnits,
                                 @Schema(nullable=true, description="The driver's reason when the order was not delivered in full") String issueKind,
                                 @Schema(nullable=true) String recipientName, int photos, int signatures,
                                 @Schema(nullable=true) Receipt receiptRecord, @Schema(nullable=true) Discrepancy discrepancy,
                                 boolean canConfirm, @Schema(nullable=true, description="Why the receipt cannot be recorded yet") String blocker,
                                 List<Event> timeline) {}

    @Schema(name="ReceiptEvent")
    public record Event(String label, Instant at) {}

    @Schema(name="ReceiptRecord")
    public record Receipt(long id, long orderId, long deliveryRecordId, String outletId,
                          @Schema(description="CONFIRMED or DISPUTED") String outcome, int deliveredUnits,
                          @Schema(nullable=true, description="SHORT, DAMAGED, WRONG_ITEM or OTHER") String kind,
                          @Schema(nullable=true) Integer affectedUnits, @Schema(nullable=true) String note,
                          String confirmedByName, Instant confirmedAt) {}

    @Schema(name="ReceiptDiscrepancy")
    public record Discrepancy(long id, long receiptId, long orderId, String orderRef, String outletId, String depot, int deliveredUnits,
                              String kind, int affectedUnits, @Schema(nullable=true) String note,
                              @Schema(nullable=true) String vehicleId, @Schema(nullable=true) String driverName,
                              @Schema(nullable=true) Instant deliveredAt, String reportedByName, Instant reportedAt,
                              @Schema(description="OPEN or RESOLVED") String status,
                              @Schema(nullable=true, description="CREDIT, REPLACEMENT or NO_ACTION") String decision,
                              @Schema(nullable=true) String decisionNote, @Schema(nullable=true) String resolvedByName,
                              @Schema(nullable=true) Instant resolvedAt, int version) {}

    @Schema(name="StoreHome", description="The store manager's home summary. Every count is computed on the server for the signed-in outlet.")
    public record StoreHome(String outletId, String brand, String district, String depot,
                            @Schema(description="Orders confirmed, planned, loaded, in transit or deferred") long openOrders,
                            @Schema(description="Deliveries still planned, loading or on the road") int pendingDeliveries,
                            @Schema(description="Reported issues the dispatcher has not resolved") int openIssues,
                            @Schema(description="Orders delivered in full or part, or already received") long completedOrders,
                            @Schema(nullable=true, description="The earliest delivery still to arrive") DeliveryRow nextDelivery,
                            @Schema(nullable=true, description="The most recently reported open issue") Discrepancy latestOpenIssue) {}

    @Schema(name="StoreOrderRow", description="One order on the store manager's Orders screen, with the group its chip belongs to.")
    public record StoreOrderRow(long id, String ref, LocalDate orderDate, LocalDate planningDate, Instant placedAt, String status,
                                @Schema(description="SUBMITTED, PLANNED, IN_DELIVERY, DELIVERED, ISSUE, DEFERRED or CANCELLED") String group,
                                String tempRequirement, int units, java.math.BigDecimal weightKg, java.math.BigDecimal volumeM3,
                                @Schema(description="The planned delivery day once known, else the planning run the order sits in") LocalDate deliveryDate,
                                @Schema(nullable=true) LocalTime windowOpen, @Schema(nullable=true) LocalTime windowClose,
                                @Schema(nullable=true) LocalTime plannedArrival) {}

    @Schema(name="StoreOrderCounts", description="How many of the outlet's orders sit in each chip. Independent of the search and the selected chip.")
    public record StoreOrderCounts(int all, int submitted, int planned, int inDelivery, int delivered, int issue, int deferred) {}

    @Schema(name="StoreOrderBoard")
    public record StoreOrderBoard(StoreOrderCounts counts, List<StoreOrderRow> items, long total, int page, int size) {}

    @Schema(name="StoreNotification", description="One thing that happened to the outlet's orders, newest first. Built from stored events; there is no read state.")
    public record StoreNotification(
        @Schema(description="ORDER_SUBMITTED, ORDER_DEFERRED, ORDER_DISPATCHED, ORDER_DELIVERED, RECEIPT_CONFIRMED, ISSUE_REPORTED or ISSUE_RESOLVED") String kind,
        long orderId, String orderRef, Instant at,
        @Schema(nullable=true, description="The delivery or planning day the event is about, when there is one") LocalDate date) {}
}
