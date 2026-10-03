package lk.techtrithalon.waypoint.ordering.application;

/** Ordering rules shared by the place-order command and the estimate the store sees beforehand. */
final class OrderRules {
    private OrderRules() {}

    /** Only Fresh outlets may place chilled orders. */
    static boolean mayOrder(String brand, String temp) {
        return !"chilled".equals(temp) || "Fresh".equals(brand);
    }
}
