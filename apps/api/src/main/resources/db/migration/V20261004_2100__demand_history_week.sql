-- Observed weekly demand per depot and brand, aggregated from the supplied historical deliveries.
-- Additive and advisory: nothing here feeds planning, allocation or the R1-R12 validator.
-- One row per depot + brand + ISO week. Volumes are the sum of ordered volume by order_date,
-- so a deferred order is counted once, in the week it was ordered.
CREATE TABLE demand_history_week (
    depot             VARCHAR(40)    NOT NULL,
    brand             VARCHAR(20)    NOT NULL,
    iso_year          SMALLINT       NOT NULL,
    iso_week          SMALLINT       NOT NULL,
    operating_days    SMALLINT       NOT NULL,
    order_count       INTEGER        NOT NULL,
    total_volume_m3   NUMERIC(12, 3) NOT NULL,
    chilled_volume_m3 NUMERIC(12, 3) NOT NULL,
    PRIMARY KEY (depot, brand, iso_year, iso_week),
    CONSTRAINT demand_history_week_operating_days CHECK (operating_days BETWEEN 1 AND 7),
    CONSTRAINT demand_history_week_volumes CHECK (total_volume_m3 >= 0
        AND chilled_volume_m3 >= 0 AND chilled_volume_m3 <= total_volume_m3)
);

CREATE INDEX demand_history_week_series ON demand_history_week (depot, brand, iso_year, iso_week);
