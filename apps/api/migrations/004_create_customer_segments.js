exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE customer_segments (
      segment_id serial PRIMARY KEY,
      segment_name varchar(30) NOT NULL UNIQUE,
      description text,
      CHECK (segment_name IN ('New', 'Occasional', 'Loyal', 'VIP'))
    );
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('customer_segments');
};
