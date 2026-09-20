exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE orders (
      order_id serial PRIMARY KEY,
      customer_id int NOT NULL,
      region_id int NOT NULL,
      fulfilling_warehouse_id int NOT NULL,
      campaign_id int,
      segment_at_order int NOT NULL,
      order_date timestamptz NOT NULL,
      order_status varchar(20) NOT NULL,
      total_amount numeric(10,2) NOT NULL,
      CHECK (order_status IN ('pending', 'completed', 'cancelled')),
      CHECK (total_amount >= 0),
      FOREIGN KEY (customer_id)
        REFERENCES customers(customer_id)
        ON DELETE RESTRICT,
      FOREIGN KEY (region_id)
        REFERENCES regions(region_id)
        ON DELETE RESTRICT,
      FOREIGN KEY (fulfilling_warehouse_id)
        REFERENCES warehouses(warehouse_id)
        ON DELETE RESTRICT,
      FOREIGN KEY (campaign_id)
        REFERENCES marketing_campaigns(campaign_id)
        ON DELETE RESTRICT,
      FOREIGN KEY (segment_at_order)
        REFERENCES customer_segments(segment_id)
        ON DELETE RESTRICT
    );

    CREATE INDEX orders_order_date_idx ON orders (order_date);
    CREATE INDEX orders_customer_id_idx ON orders (customer_id);
    CREATE INDEX orders_region_id_idx ON orders (region_id);
    CREATE INDEX orders_campaign_id_idx ON orders (campaign_id);
    CREATE INDEX orders_segment_at_order_idx ON orders (segment_at_order);
    CREATE INDEX orders_region_id_order_date_idx
      ON orders (region_id, order_date);
    CREATE INDEX orders_order_status_order_date_idx
      ON orders (order_status, order_date);
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('orders');
};
