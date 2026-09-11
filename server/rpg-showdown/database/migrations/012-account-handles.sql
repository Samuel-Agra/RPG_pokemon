ALTER TABLE rpg_accounts
  ADD COLUMN handle VARCHAR(30) NULL AFTER username;

UPDATE rpg_accounts SET handle = username WHERE handle IS NULL OR handle = '';

ALTER TABLE rpg_accounts
  MODIFY COLUMN handle VARCHAR(30) NOT NULL,
  ADD UNIQUE KEY uq_rpg_accounts_handle (handle);
