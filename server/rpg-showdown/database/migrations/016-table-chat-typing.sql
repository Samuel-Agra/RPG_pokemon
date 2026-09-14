CREATE TABLE IF NOT EXISTS rpg_table_chat_typing (
  table_id VARCHAR(100) NOT NULL,
  account_id VARCHAR(100) NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (table_id, account_id),
  KEY idx_rpg_table_chat_typing_expiry (updated_at),
  CONSTRAINT fk_rpg_table_chat_typing_table FOREIGN KEY (table_id) REFERENCES rpg_campaign_tables(id) ON DELETE CASCADE,
  CONSTRAINT fk_rpg_table_chat_typing_account FOREIGN KEY (account_id) REFERENCES rpg_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;
