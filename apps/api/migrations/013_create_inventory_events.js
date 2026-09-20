exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE inventory_events (
      inventory_event_id serial PRIMARY KEY,
      product_id int NOT NULL,
      warehouse_id int NOT NULL,
      event_date timestamptz NOT NULL,
      event_type varchar(30) NOT NULL,
      stock_level_after int NOT NULL,
      CHECK (
        event_type IN (
          'initial_stock',
          'restock',
          'shortage_start',
          'shortage_end',
          'adjustment'
        )
      ),
      CHECK (stock_level_after >= 0),
      FOREIGN KEY (product_id)
        REFERENCES products(product_id)
        ON DELETE RESTRICT,
      FOREIGN KEY (warehouse_id)
        REFERENCES warehouses(warehouse_id)
        ON DELETE RESTRICT
    );

    CREATE INDEX inventory_events_product_warehouse_event_date_idx
      ON inventory_events (product_id, warehouse_id, event_date);
    CREATE UNIQUE INDEX inventory_events_initial_stock_unique_idx
      ON inventory_events (product_id, warehouse_id)
      WHERE event_type = 'initial_stock';
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('inventory_events');
};
