ALTER TABLE rpg_accounts
  ADD COLUMN profile JSON NULL AFTER display_name;

UPDATE rpg_accounts
SET display_name = handle
WHERE handle IS NOT NULL AND handle <> '';
