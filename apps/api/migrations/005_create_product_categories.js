exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE product_categories (
      category_id serial PRIMARY KEY,
      category_name varchar(50) NOT NULL UNIQUE
    );
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('product_categories');
};
