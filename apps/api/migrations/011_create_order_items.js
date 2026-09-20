exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE order_items (
      order_item_id serial PRIMARY KEY,
      order_id int NOT NULL,
      product_id int NOT NULL,
      quantity int NOT NULL CHECK (quantity > 0),
      unit_price_at_purchase numeric(10,2) NOT NULL
        CHECK (unit_price_at_purchase > 0),
      line_total numeric GENERATED ALWAYS AS
        (quantity * unit_price_at_purchase) STORED,
      FOREIGN KEY (order_id)
        REFERENCES orders(order_id)
        ON DELETE RESTRICT,
      FOREIGN KEY (product_id)
        REFERENCES products(product_id)
        ON DELETE RESTRICT
    );

    CREATE INDEX order_items_order_id_idx ON order_items (order_id);
    CREATE INDEX order_items_product_id_idx ON order_items (product_id);
    CREATE INDEX order_items_product_id_order_id_idx
      ON order_items (product_id, order_id);
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('order_items');
};
