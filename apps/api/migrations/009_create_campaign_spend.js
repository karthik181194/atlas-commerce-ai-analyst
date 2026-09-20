exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE campaign_spend (
      campaign_spend_id serial PRIMARY KEY,
      campaign_id int NOT NULL,
      spend_date date NOT NULL,
      amount numeric(10,2) NOT NULL CHECK (amount >= 0),
      UNIQUE (campaign_id, spend_date),
      FOREIGN KEY (campaign_id)
        REFERENCES marketing_campaigns(campaign_id)
        ON DELETE RESTRICT
    );

    CREATE INDEX campaign_spend_spend_date_idx ON campaign_spend (spend_date);
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('campaign_spend');
};
