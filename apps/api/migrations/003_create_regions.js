exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE regions (
      region_id serial PRIMARY KEY,
      region_name varchar(50) NOT NULL UNIQUE,
      default_warehouse_id int NOT NULL,
      FOREIGN KEY (default_warehouse_id)
        REFERENCES warehouses(warehouse_id)
        ON DELETE RESTRICT
    );

    CREATE INDEX regions_default_warehouse_id_idx
      ON regions (default_warehouse_id);
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('regions');
};
