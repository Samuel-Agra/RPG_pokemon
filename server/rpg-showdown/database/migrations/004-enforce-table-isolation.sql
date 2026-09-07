INSERT IGNORE INTO rpg_accounts
  (id, username, display_name, credential, status, created_at, updated_at, revision)
VALUES
  ('2b4fcc72b9d723d6ac30311fdb50ca4b31f8', 'mestre', 'Mestre',
   CAST('{"algorithm":"scrypt","salt":"","hash":""}' AS JSON), 'active', 0, 0, 0);

INSERT IGNORE INTO rpg_campaign_tables
  (id, owner_account_id, name, description, color, visibility, status, settings, created_at, updated_at, revision)
SELECT
  '68521384ad8987b3240fc12c15562918287e', id,
   'Mesa principal', 'Campanha migrada da versão 1', '#355487', 'private', 'active',
   CAST('{"legacyV1":true}' AS JSON), 0, 0, 0
FROM rpg_accounts WHERE username = 'mestre' LIMIT 1;

UPDATE rpg_characters SET table_id = '68521384ad8987b3240fc12c15562918287e' WHERE table_id IS NULL;
UPDATE rpg_battle_sessions SET table_id = '68521384ad8987b3240fc12c15562918287e' WHERE table_id IS NULL;
UPDATE rpg_contest_sessions SET table_id = '68521384ad8987b3240fc12c15562918287e' WHERE table_id IS NULL;
UPDATE rpg_tournaments SET table_id = '68521384ad8987b3240fc12c15562918287e' WHERE table_id IS NULL;
UPDATE rpg_contest_combos SET table_id = '68521384ad8987b3240fc12c15562918287e' WHERE table_id IS NULL;
UPDATE rpg_custom_items SET table_id = '68521384ad8987b3240fc12c15562918287e' WHERE table_id IS NULL;
UPDATE rpg_shops SET table_id = '68521384ad8987b3240fc12c15562918287e' WHERE table_id IS NULL;
UPDATE rpg_master_npc_library SET table_id = '68521384ad8987b3240fc12c15562918287e' WHERE table_id IS NULL;
UPDATE rpg_player_documents SET table_id = '68521384ad8987b3240fc12c15562918287e' WHERE table_id IS NULL;
UPDATE rpg_campaign SET table_id = '68521384ad8987b3240fc12c15562918287e' WHERE table_id IS NULL;

ALTER TABLE rpg_characters DROP PRIMARY KEY, MODIFY table_id VARCHAR(100) NOT NULL,
  ADD PRIMARY KEY (table_id, id);
ALTER TABLE rpg_battle_sessions DROP PRIMARY KEY, MODIFY table_id VARCHAR(100) NOT NULL,
  ADD PRIMARY KEY (table_id, id);
ALTER TABLE rpg_contest_sessions DROP PRIMARY KEY, MODIFY table_id VARCHAR(100) NOT NULL,
  ADD PRIMARY KEY (table_id, id);
ALTER TABLE rpg_tournaments DROP PRIMARY KEY, MODIFY table_id VARCHAR(100) NOT NULL,
  ADD PRIMARY KEY (table_id, id);
ALTER TABLE rpg_contest_combos DROP PRIMARY KEY, MODIFY table_id VARCHAR(100) NOT NULL,
  ADD PRIMARY KEY (table_id, id);
ALTER TABLE rpg_custom_items DROP PRIMARY KEY, MODIFY table_id VARCHAR(100) NOT NULL,
  ADD PRIMARY KEY (table_id, id);
ALTER TABLE rpg_shops DROP PRIMARY KEY, MODIFY table_id VARCHAR(100) NOT NULL,
  ADD PRIMARY KEY (table_id, id);
ALTER TABLE rpg_master_npc_library DROP PRIMARY KEY, MODIFY table_id VARCHAR(100) NOT NULL,
  ADD PRIMARY KEY (table_id, singleton_id);
ALTER TABLE rpg_player_documents DROP PRIMARY KEY, MODIFY table_id VARCHAR(100) NOT NULL,
  ADD PRIMARY KEY (table_id, character_id);
ALTER TABLE rpg_campaign DROP PRIMARY KEY, MODIFY table_id VARCHAR(100) NOT NULL,
  ADD PRIMARY KEY (table_id, singleton_id);
