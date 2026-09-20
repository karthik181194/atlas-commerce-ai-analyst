exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE customers (
      customer_id serial PRIMARY KEY,
      first_name varchar(50) NOT NULL,
      last_name varchar(50) NOT NULL,
      email varchar(120) NOT NULL UNIQUE,
      region_id int NOT NULL,
      segment_id int NOT NULL,
      signup_date date NOT NULL,
      FOREIGN KEY (region_id)
        REFERENCES regions(region_id)
        ON DELETE RESTRICT,
      FOREIGN KEY (segment_id)
        REFERENCES customer_segments(segment_id)
        ON DELETE RESTRICT
    );

    CREATE INDEX customers_region_id_idx ON customers (region_id);
    CREATE INDEX customers_segment_id_idx ON customers (segment_id);
    CREATE INDEX customers_signup_date_idx ON customers (signup_date);
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('customers');
};
