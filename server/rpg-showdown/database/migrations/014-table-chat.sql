CREATE TABLE IF NOT EXISTS rpg_table_chat_messages (
  id VARCHAR(100) NOT NULL,
  table_id VARCHAR(100) NOT NULL,
  author_account_id VARCHAR(100) NOT NULL,
  message VARCHAR(1000) NOT NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_rpg_table_chat_table_created (table_id, created_at),
  KEY idx_rpg_table_chat_expiration (expires_at),
  CONSTRAINT fk_rpg_table_chat_table FOREIGN KEY (table_id) REFERENCES rpg_campaign_tables(id) ON DELETE CASCADE,
  CONSTRAINT fk_rpg_table_chat_author FOREIGN KEY (author_account_id) REFERENCES rpg_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;
