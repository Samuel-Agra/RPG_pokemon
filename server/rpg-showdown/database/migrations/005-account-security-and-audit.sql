CREATE TABLE IF NOT EXISTS rpg_account_recovery_codes (
  id VARCHAR(100) NOT NULL,
  account_id VARCHAR(100) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  used_at BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rpg_recovery_code_hash (code_hash),
  KEY idx_rpg_recovery_account (account_id, used_at),
  CONSTRAINT fk_rpg_recovery_account FOREIGN KEY (account_id) REFERENCES rpg_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rpg_login_attempts (
  attempt_key CHAR(64) NOT NULL,
  failures SMALLINT UNSIGNED NOT NULL,
  window_started_at BIGINT UNSIGNED NOT NULL,
  blocked_until BIGINT UNSIGNED NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (attempt_key),
  KEY idx_rpg_login_attempt_expiry (blocked_until, updated_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rpg_admin_audit (
  id VARCHAR(100) NOT NULL,
  table_id VARCHAR(100) NOT NULL,
  actor_account_id VARCHAR(100) NOT NULL,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(40) NOT NULL,
  target_id VARCHAR(100) NULL,
  metadata JSON NOT NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_rpg_audit_table_time (table_id, created_at),
  KEY idx_rpg_audit_actor (actor_account_id, created_at),
  CONSTRAINT fk_rpg_audit_table FOREIGN KEY (table_id) REFERENCES rpg_campaign_tables(id) ON DELETE CASCADE,
  CONSTRAINT fk_rpg_audit_actor FOREIGN KEY (actor_account_id) REFERENCES rpg_accounts(id)
) ENGINE=InnoDB;
