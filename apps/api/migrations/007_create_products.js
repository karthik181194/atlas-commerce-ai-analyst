exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE products (
      product_id serial PRIMARY KEY,
      product_name varchar(150) NOT NULL,
      category_id int NOT NULL,
      unit_price numeric(10,2) NOT NULL CHECK (unit_price > 0),
      unit_cost numeric(10,2) NOT NULL CHECK (unit_cost > 0),
      launch_date date NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      FOREIGN KEY (category_id)
        REFERENCES product_categories(category_id)
        ON DELETE RESTRICT
    );

    CREATE INDEX products_category_id_idx ON products (category_id);
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('products');
};
