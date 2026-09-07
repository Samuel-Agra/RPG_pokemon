CREATE TABLE IF NOT EXISTS rpg_accounts (
  id VARCHAR(100) NOT NULL,
  username VARCHAR(40) NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  credential JSON NOT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_at BIGINT UNSIGNED NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rpg_accounts_username (username)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rpg_campaign_tables (
  id VARCHAR(100) NOT NULL,
  owner_account_id VARCHAR(100) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  color VARCHAR(20) NOT NULL DEFAULT '#355487',
  visibility ENUM('private', 'code', 'public') NOT NULL DEFAULT 'private',
  status ENUM('active', 'archived') NOT NULL DEFAULT 'active',
  settings JSON NOT NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_rpg_campaign_tables_owner (owner_account_id),
  CONSTRAINT fk_rpg_campaign_tables_owner FOREIGN KEY (owner_account_id) REFERENCES rpg_accounts(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rpg_table_members (
  table_id VARCHAR(100) NOT NULL,
  account_id VARCHAR(100) NOT NULL,
  role ENUM('owner', 'master', 'player', 'spectator') NOT NULL,
  status ENUM('active', 'left', 'removed', 'blocked') NOT NULL DEFAULT 'active',
  permissions JSON NOT NULL,
  joined_at BIGINT UNSIGNED NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (table_id, account_id),
  KEY idx_rpg_table_members_account (account_id, status),
  CONSTRAINT fk_rpg_table_members_table FOREIGN KEY (table_id) REFERENCES rpg_campaign_tables(id),
  CONSTRAINT fk_rpg_table_members_account FOREIGN KEY (account_id) REFERENCES rpg_accounts(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rpg_table_invites (
  id VARCHAR(100) NOT NULL,
  table_id VARCHAR(100) NOT NULL,
  created_by_account_id VARCHAR(100) NOT NULL,
  target_account_id VARCHAR(100) NULL,
  code_hash CHAR(64) NOT NULL,
  role ENUM('master', 'player', 'spectator') NOT NULL DEFAULT 'player',
  status ENUM('active', 'revoked', 'expired') NOT NULL DEFAULT 'active',
  max_uses INT UNSIGNED NOT NULL DEFAULT 1,
  used_count INT UNSIGNED NOT NULL DEFAULT 0,
  expires_at BIGINT UNSIGNED NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rpg_table_invites_code_hash (code_hash),
  KEY idx_rpg_table_invites_table (table_id, status),
  CONSTRAINT fk_rpg_table_invites_table FOREIGN KEY (table_id) REFERENCES rpg_campaign_tables(id),
  CONSTRAINT fk_rpg_table_invites_creator FOREIGN KEY (created_by_account_id) REFERENCES rpg_accounts(id),
  CONSTRAINT fk_rpg_table_invites_target FOREIGN KEY (target_account_id) REFERENCES rpg_accounts(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rpg_account_sessions (
  token_hash CHAR(64) NOT NULL,
  account_id VARCHAR(100) NOT NULL,
  active_table_id VARCHAR(100) NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  last_seen_at BIGINT UNSIGNED NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  revoked_at BIGINT UNSIGNED NULL,
  PRIMARY KEY (token_hash),
  KEY idx_rpg_account_sessions_account (account_id, expires_at),
  CONSTRAINT fk_rpg_account_sessions_account FOREIGN KEY (account_id) REFERENCES rpg_accounts(id),
  CONSTRAINT fk_rpg_account_sessions_table FOREIGN KEY (active_table_id) REFERENCES rpg_campaign_tables(id)
) ENGINE=InnoDB;
