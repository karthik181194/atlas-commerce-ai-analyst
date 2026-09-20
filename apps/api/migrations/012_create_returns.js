exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE returns (
      return_id serial PRIMARY KEY,
      order_item_id int NOT NULL,
      return_date date NOT NULL,
      processed_date date NOT NULL,
      reason varchar(30) NOT NULL,
      refund_amount numeric(10,2) NOT NULL,
      CHECK (processed_date >= return_date),
      CHECK (reason IN ('defective', 'wrong_item', 'changed_mind', 'not_as_described')),
      CHECK (refund_amount >= 0),
      FOREIGN KEY (order_item_id)
        REFERENCES order_items(order_item_id)
        ON DELETE RESTRICT
    );

    CREATE INDEX returns_order_item_id_idx ON returns (order_item_id);
    CREATE INDEX returns_return_date_idx ON returns (return_date);
    CREATE INDEX returns_processed_date_idx ON returns (processed_date);
    CREATE INDEX returns_reason_idx ON returns (reason);
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('returns');
};
