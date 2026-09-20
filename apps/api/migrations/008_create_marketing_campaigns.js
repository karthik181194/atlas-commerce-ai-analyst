exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE marketing_campaigns (
      campaign_id serial PRIMARY KEY,
      campaign_name varchar(120) NOT NULL,
      channel varchar(30) NOT NULL,
      target_segment_id int,
      target_region_id int,
      start_date date NOT NULL,
      end_date date NOT NULL,
      budget numeric(10,2) NOT NULL,
      CHECK (channel IN ('email', 'paid_social', 'search', 'display')),
      CHECK (end_date >= start_date),
      CHECK (budget >= 0),
      FOREIGN KEY (target_segment_id)
        REFERENCES customer_segments(segment_id)
        ON DELETE RESTRICT,
      FOREIGN KEY (target_region_id)
        REFERENCES regions(region_id)
        ON DELETE RESTRICT
    );

    CREATE INDEX marketing_campaigns_target_segment_id_idx
      ON marketing_campaigns (target_segment_id);
    CREATE INDEX marketing_campaigns_target_region_id_idx
      ON marketing_campaigns (target_region_id);
    CREATE INDEX marketing_campaigns_start_date_end_date_idx
      ON marketing_campaigns (start_date, end_date);
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('marketing_campaigns');
};
