exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE warehouses (
      warehouse_id serial PRIMARY KEY,
      warehouse_name varchar(100) NOT NULL UNIQUE
    );
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('warehouses');
};
