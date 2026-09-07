ALTER TABLE rpg_characters
  ADD COLUMN account_id VARCHAR(100) NULL AFTER id,
  ADD COLUMN table_id VARCHAR(100) NULL AFTER account_id,
  ADD KEY idx_rpg_characters_account_table (account_id, table_id),
  ADD KEY idx_rpg_characters_table (table_id),
  ADD CONSTRAINT fk_rpg_characters_account FOREIGN KEY (account_id) REFERENCES rpg_accounts(id),
  ADD CONSTRAINT fk_rpg_characters_table FOREIGN KEY (table_id) REFERENCES rpg_campaign_tables(id);

ALTER TABLE rpg_battle_sessions ADD COLUMN table_id VARCHAR(100) NULL AFTER id,
  ADD KEY idx_rpg_battle_sessions_table (table_id),
  ADD CONSTRAINT fk_rpg_battle_sessions_table FOREIGN KEY (table_id) REFERENCES rpg_campaign_tables(id);
ALTER TABLE rpg_contest_sessions ADD COLUMN table_id VARCHAR(100) NULL AFTER id,
  ADD KEY idx_rpg_contest_sessions_table (table_id),
  ADD CONSTRAINT fk_rpg_contest_sessions_table FOREIGN KEY (table_id) REFERENCES rpg_campaign_tables(id);
ALTER TABLE rpg_tournaments ADD COLUMN table_id VARCHAR(100) NULL AFTER id,
  ADD KEY idx_rpg_tournaments_table (table_id),
  ADD CONSTRAINT fk_rpg_tournaments_table FOREIGN KEY (table_id) REFERENCES rpg_campaign_tables(id);
ALTER TABLE rpg_contest_combos ADD COLUMN table_id VARCHAR(100) NULL AFTER id,
  ADD KEY idx_rpg_contest_combos_table (table_id),
  ADD CONSTRAINT fk_rpg_contest_combos_table FOREIGN KEY (table_id) REFERENCES rpg_campaign_tables(id);
ALTER TABLE rpg_custom_items ADD COLUMN table_id VARCHAR(100) NULL AFTER id,
  ADD KEY idx_rpg_custom_items_table (table_id),
  ADD CONSTRAINT fk_rpg_custom_items_table FOREIGN KEY (table_id) REFERENCES rpg_campaign_tables(id);
ALTER TABLE rpg_shops ADD COLUMN table_id VARCHAR(100) NULL AFTER id,
  ADD KEY idx_rpg_shops_table (table_id),
  ADD CONSTRAINT fk_rpg_shops_table FOREIGN KEY (table_id) REFERENCES rpg_campaign_tables(id);
ALTER TABLE rpg_master_npc_library ADD COLUMN table_id VARCHAR(100) NULL AFTER singleton_id,
  ADD KEY idx_rpg_master_npc_library_table (table_id),
  ADD CONSTRAINT fk_rpg_master_npc_library_table FOREIGN KEY (table_id) REFERENCES rpg_campaign_tables(id);
ALTER TABLE rpg_player_documents ADD COLUMN table_id VARCHAR(100) NULL AFTER character_id,
  ADD KEY idx_rpg_player_documents_table (table_id),
  ADD CONSTRAINT fk_rpg_player_documents_table FOREIGN KEY (table_id) REFERENCES rpg_campaign_tables(id);
ALTER TABLE rpg_campaign ADD COLUMN table_id VARCHAR(100) NULL AFTER singleton_id,
  ADD KEY idx_rpg_campaign_table (table_id),
  ADD CONSTRAINT fk_rpg_campaign_table FOREIGN KEY (table_id) REFERENCES rpg_campaign_tables(id);
