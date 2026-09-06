CREATE DATABASE IF NOT EXISTS pokemon_rpg
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE pokemon_rpg;

CREATE TABLE IF NOT EXISTS rpg_schema_migrations (
  version INT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (version)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rpg_characters (
  id VARCHAR(100) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  credential JSON NOT NULL,
  state JSON NOT NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_rpg_characters_display_name (display_name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rpg_battle_sessions (
  id VARCHAR(100) NOT NULL,
  status VARCHAR(32) NOT NULL,
  state JSON NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_rpg_battle_sessions_status (status),
  KEY idx_rpg_battle_sessions_updated_at (updated_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rpg_contest_sessions (
  id VARCHAR(100) NOT NULL,
  status VARCHAR(32) NOT NULL,
  state JSON NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_rpg_contest_sessions_status (status),
  KEY idx_rpg_contest_sessions_updated_at (updated_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rpg_tournaments (
  id VARCHAR(100) NOT NULL,
  activity VARCHAR(16) NOT NULL,
  status VARCHAR(32) NOT NULL,
  state JSON NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_rpg_tournaments_activity_status (activity, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rpg_contest_combos (
  id VARCHAR(100) NOT NULL,
  definition JSON NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rpg_custom_items (
  id VARCHAR(100) NOT NULL,
  definition JSON NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rpg_shops (
  id VARCHAR(100) NOT NULL,
  shop_type VARCHAR(40) NOT NULL,
  state JSON NOT NULL,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_rpg_shops_type (shop_type)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rpg_master_npc_library (
  singleton_id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  state JSON NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (singleton_id),
  CONSTRAINT chk_rpg_master_npc_singleton CHECK (singleton_id = 1)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rpg_player_documents (
  character_id VARCHAR(100) NOT NULL,
  state JSON NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (character_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rpg_campaign (
  singleton_id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  state JSON NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (singleton_id),
  CONSTRAINT chk_rpg_campaign_singleton CHECK (singleton_id = 1)
) ENGINE=InnoDB;

INSERT IGNORE INTO rpg_schema_migrations (version, name)
VALUES (1, 'initial RPG persistence schema');
