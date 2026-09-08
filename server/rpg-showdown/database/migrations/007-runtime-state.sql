CREATE TABLE IF NOT EXISTS rpg_runtime_states (
  table_id VARCHAR(100) NOT NULL,
  runtime_type ENUM('battle', 'contest') NOT NULL,
  session_id VARCHAR(100) NOT NULL,
  state JSON NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (table_id, runtime_type, session_id),
  KEY idx_rpg_runtime_updated (updated_at),
  CONSTRAINT fk_rpg_runtime_table FOREIGN KEY (table_id) REFERENCES rpg_campaign_tables(id) ON DELETE CASCADE
) ENGINE=InnoDB;
