UPDATE rpg_table_members
SET role = 'player'
WHERE role = 'spectator';

UPDATE rpg_table_invites
SET role = 'player'
WHERE role = 'spectator';

ALTER TABLE rpg_table_members
  MODIFY COLUMN role ENUM('owner', 'master', 'player') NOT NULL;

ALTER TABLE rpg_table_invites
  MODIFY COLUMN role ENUM('master', 'player') NOT NULL DEFAULT 'player';
