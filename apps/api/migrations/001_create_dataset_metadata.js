exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE dataset_metadata (
      key varchar(50) PRIMARY KEY,
      value text NOT NULL
    );

    INSERT INTO dataset_metadata (key, value)
    VALUES
      ('as_of_date', '2025-09-15'),
      ('dataset_start_date', '2023-03-01'),
      ('generated_at', CURRENT_TIMESTAMP::text);
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('dataset_metadata');
};
