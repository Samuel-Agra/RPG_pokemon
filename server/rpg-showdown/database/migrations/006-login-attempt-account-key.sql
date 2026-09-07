ALTER TABLE rpg_login_attempts
  ADD COLUMN account_key CHAR(64) NULL AFTER attempt_key,
  ADD KEY idx_rpg_login_attempt_account (account_key);

-- Chaves antigas nao permitem identificar a conta sem reverter hashes. Elas sao temporarias,
-- portanto a migracao as remove para nao preservar um bloqueio que a recuperacao nao poderia limpar.
DELETE FROM rpg_login_attempts WHERE account_key IS NULL;
