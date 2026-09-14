CREATE TABLE IF NOT EXISTS rpg_account_notifications (
  id VARCHAR(64) PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL,
  table_id VARCHAR(64) NULL,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(160) NOT NULL,
  message VARCHAR(500) NOT NULL,
  action VARCHAR(24) NOT NULL,
  created_at BIGINT NOT NULL,
  read_at BIGINT NULL,
  KEY idx_rpg_account_notifications_account (account_id, created_at),
  KEY idx_rpg_account_notifications_unread (account_id, read_at),
  CONSTRAINT fk_rpg_account_notifications_account FOREIGN KEY (account_id) REFERENCES rpg_accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_rpg_account_notifications_table FOREIGN KEY (table_id) REFERENCES rpg_campaign_tables(id) ON DELETE SET NULL
);
