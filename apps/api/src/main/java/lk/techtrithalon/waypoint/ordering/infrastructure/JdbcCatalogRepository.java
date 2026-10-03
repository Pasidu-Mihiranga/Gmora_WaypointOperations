package lk.techtrithalon.waypoint.ordering.infrastructure;

import java.util.Collection;
import java.util.Collections;
import java.util.List;
import lk.techtrithalon.waypoint.ordering.application.CatalogRepository;
import lk.techtrithalon.waypoint.ordering.domain.OrderLine;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
class JdbcCatalogRepository implements CatalogRepository {
    private static final String SELECT = """
        SELECT p.id, p.category_id, c.name AS category_name, c.sort_order AS category_sort, c.brand, c.temp_requirement,
               p.name, p.weight_factor, p.volume_factor, p.sort_order
        FROM product p JOIN product_category c ON c.id = p.category_id
        """;
    private static final RowMapper<Product> ROW = (rs, n) -> new Product(rs.getLong("id"), rs.getLong("category_id"),
        rs.getString("category_name"), rs.getInt("category_sort"), rs.getString("brand"), rs.getString("temp_requirement"),
        rs.getString("name"), rs.getBigDecimal("weight_factor"), rs.getBigDecimal("volume_factor"), rs.getInt("sort_order"));

    private final JdbcTemplate db;

    JdbcCatalogRepository(JdbcTemplate db) { this.db = db; }

    @Override
    public List<Product> activeProducts(String brand, String tempRequirement) {
        return db.query(SELECT + " WHERE p.active AND c.brand=? AND c.temp_requirement=? ORDER BY c.sort_order, p.sort_order", ROW, brand, tempRequirement);
    }

    @Override
    public List<Product> productsByIds(Collection<Long> ids) {
        if (ids.isEmpty()) return List.of();
        return db.query(SELECT + " WHERE p.active AND p.id IN (" + String.join(",", Collections.nCopies(ids.size(), "?")) + ")", ROW, ids.toArray());
    }

    @Override
    public void insertLines(long orderId, List<OrderLine> lines) {
        for (var line : lines) {
            db.update("INSERT INTO order_line (order_id, product_id, product_name, category_name, quantity) VALUES (?,?,?,?,?)",
                orderId, line.productId(), line.productName(), line.categoryName(), line.quantity());
        }
    }

    @Override
    public List<OrderLine> lines(long orderId) {
        return db.query("SELECT product_id, product_name, category_name, quantity FROM order_line WHERE order_id=? ORDER BY id",
            (rs, n) -> new OrderLine(rs.getLong("product_id"), rs.getString("product_name"), rs.getString("category_name"), rs.getInt("quantity")), orderId);
    }
}
