CREATE TABLE IF NOT EXISTS rpg_table_system_log (
  id VARCHAR(100) NOT NULL,
  table_id VARCHAR(100) NOT NULL,
  category VARCHAR(32) NOT NULL,
  title VARCHAR(160) NOT NULL,
  description VARCHAR(1000) NOT NULL,
  audience_character_ids JSON NOT NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_rpg_table_system_log_table_created (table_id, created_at),
  KEY idx_rpg_table_system_log_expiration (expires_at),
  CONSTRAINT fk_rpg_table_system_log_table FOREIGN KEY (table_id) REFERENCES rpg_campaign_tables(id) ON DELETE CASCADE
) ENGINE=InnoDB;
