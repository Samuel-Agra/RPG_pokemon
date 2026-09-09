ALTER TABLE rpg_table_members
  MODIFY COLUMN status ENUM('active', 'pending', 'left', 'removed', 'blocked') NOT NULL DEFAULT 'active',
  ADD COLUMN request_invite_id VARCHAR(100) NULL AFTER permissions,
  ADD KEY idx_rpg_table_members_requests (table_id, status, updated_at),
  ADD CONSTRAINT fk_rpg_table_members_request_invite FOREIGN KEY (request_invite_id) REFERENCES rpg_table_invites(id) ON DELETE SET NULL;
