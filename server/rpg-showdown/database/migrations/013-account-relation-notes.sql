CREATE TABLE IF NOT EXISTS rpg_account_relation_notes (
  author_account_id VARCHAR(100) NOT NULL,
  target_account_id VARCHAR(100) NOT NULL,
  note TEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (author_account_id, target_account_id),
  CONSTRAINT fk_rpg_account_relation_notes_author FOREIGN KEY (author_account_id) REFERENCES rpg_accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_rpg_account_relation_notes_target FOREIGN KEY (target_account_id) REFERENCES rpg_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;
