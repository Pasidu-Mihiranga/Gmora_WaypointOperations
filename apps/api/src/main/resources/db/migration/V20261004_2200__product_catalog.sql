-- Synthetic demo catalog for the store manager's order flow, plus the lines saved with each order.
-- The competition dataset describes an order only by units, weight and volume (order_units is "items or cases"),
-- so this catalog is invented for the demonstration. Item names and groups come from the Figma store screens and
-- from the booklet's description of each brand's goods. Items carry only a relative size: the real kilograms and
-- cubic metres per unit are worked out at run time from the dataset's own average for the brand and temperature,
-- so order totals stay in step with real orders. Nothing here holds a price.

CREATE TABLE product_category (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    brand            varchar(12) NOT NULL,
    temp_requirement varchar(8)  NOT NULL CHECK (temp_requirement IN ('ambient', 'chilled')),
    name             varchar(40) NOT NULL,
    sort_order       integer     NOT NULL,
    UNIQUE (brand, temp_requirement, name)
);

CREATE TABLE product (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_id   bigint       NOT NULL REFERENCES product_category(id),
    name          varchar(60)  NOT NULL,
    weight_factor numeric(6,3) NOT NULL CHECK (weight_factor > 0),
    volume_factor numeric(6,3) NOT NULL CHECK (volume_factor > 0),
    sort_order    integer      NOT NULL,
    active        boolean      NOT NULL DEFAULT true,
    UNIQUE (category_id, name)
);
COMMENT ON TABLE product IS 'Synthetic demo catalog. weight_factor and volume_factor scale the dataset average per unit for the brand and temperature.';

-- The name and group are copied onto the line so a saved order reads the same even if the catalog changes later.
CREATE TABLE order_line (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id      bigint      NOT NULL REFERENCES customer_order(id) ON DELETE CASCADE,
    product_id    bigint      NOT NULL REFERENCES product(id),
    product_name  varchar(60) NOT NULL,
    category_name varchar(40) NOT NULL,
    quantity      integer     NOT NULL CHECK (quantity > 0),
    UNIQUE (order_id, product_id)
);
CREATE INDEX order_line_order_idx ON order_line(order_id);

INSERT INTO product_category (brand, temp_requirement, name, sort_order) VALUES
    ('Fresh', 'chilled', 'Dairy & Chilled', 1), ('Fresh', 'chilled', 'Bakery', 2), ('Fresh', 'chilled', 'Beverages', 3), ('Fresh', 'chilled', 'Frozen', 4),
    ('Fresh', 'ambient', 'Pantry', 1), ('Fresh', 'ambient', 'Bakery', 2), ('Fresh', 'ambient', 'Beverages', 3), ('Fresh', 'ambient', 'Snacks', 4),
    ('Style', 'ambient', 'Hanging garments', 1), ('Style', 'ambient', 'Cartons', 2),
    ('Tech',  'ambient', 'Appliances', 1), ('Tech',  'ambient', 'Consumer electronics', 2);

INSERT INTO product (category_id, name, weight_factor, volume_factor, sort_order)
SELECT c.id, v.name, v.weight_factor, v.volume_factor, v.sort_order
FROM (VALUES
    ('Fresh', 'chilled', 'Dairy & Chilled', 'Full Cream Milk 1L',   1.000, 1.000, 1),
    ('Fresh', 'chilled', 'Dairy & Chilled', 'Fresh Curd 400g',      0.450, 0.500, 2),
    ('Fresh', 'chilled', 'Dairy & Chilled', 'Butter 200g',          0.200, 0.250, 3),
    ('Fresh', 'chilled', 'Dairy & Chilled', 'Cheese Slices 200g',   0.200, 0.250, 4),
    ('Fresh', 'chilled', 'Bakery',          'White Bread Loaf',     0.400, 1.600, 1),
    ('Fresh', 'chilled', 'Bakery',          'Milk Toast Pack',      0.350, 1.400, 2),
    ('Fresh', 'chilled', 'Beverages',       'Orange Juice 1L',      1.000, 1.000, 1),
    ('Fresh', 'chilled', 'Beverages',       'Yogurt Drink 180ml',   0.200, 0.220, 2),
    ('Fresh', 'chilled', 'Frozen',          'Ice Cream Tub 1L',     0.900, 1.100, 1),
    ('Fresh', 'ambient', 'Pantry',          'Rice 5kg',             5.000, 2.500, 1),
    ('Fresh', 'ambient', 'Pantry',          'Tea Bags 100ct',       0.250, 0.600, 2),
    ('Fresh', 'ambient', 'Pantry',          'Sugar 1kg',            1.000, 0.900, 3),
    ('Fresh', 'ambient', 'Pantry',          'Flour 1kg',            1.000, 0.950, 4),
    ('Fresh', 'ambient', 'Pantry',          'Salt 1kg',             1.000, 0.800, 5),
    ('Fresh', 'ambient', 'Bakery',          'White Bread Loaf',     0.400, 1.600, 1),
    ('Fresh', 'ambient', 'Bakery',          'Milk Toast Pack',      0.350, 1.400, 2),
    ('Fresh', 'ambient', 'Beverages',       'Coffee 200g',          0.200, 0.350, 1),
    ('Fresh', 'ambient', 'Snacks',          'Biscuits Pack',        0.300, 0.800, 1),
    ('Style', 'ambient', 'Hanging garments','Ladies Dress Rail',    1.200, 2.600, 1),
    ('Style', 'ambient', 'Hanging garments','Men''s Shirt Rail',    1.000, 2.200, 2),
    ('Style', 'ambient', 'Hanging garments','Kids Wear Rail',       0.700, 1.800, 3),
    ('Style', 'ambient', 'Cartons',         'Folded T-Shirt Carton',0.900, 1.000, 1),
    ('Style', 'ambient', 'Cartons',         'Denim Carton',         1.600, 1.100, 2),
    ('Style', 'ambient', 'Cartons',         'Accessories Carton',   0.500, 0.700, 3),
    ('Tech',  'ambient', 'Appliances',      'Refrigerator',         5.500, 6.000, 1),
    ('Tech',  'ambient', 'Appliances',      'Washing Machine',      4.800, 4.500, 2),
    ('Tech',  'ambient', 'Appliances',      'Microwave Oven',       1.600, 1.400, 3),
    ('Tech',  'ambient', 'Consumer electronics', 'LED TV 55"',     2.400, 3.200, 1),
    ('Tech',  'ambient', 'Consumer electronics', 'Laptop Carton',  0.500, 0.400, 2),
    ('Tech',  'ambient', 'Consumer electronics', 'Smartphone Carton', 0.150, 0.120, 3)
) AS v(brand, temp, category, name, weight_factor, volume_factor, sort_order)
JOIN product_category c ON c.brand = v.brand AND c.temp_requirement = v.temp AND c.name = v.category;
