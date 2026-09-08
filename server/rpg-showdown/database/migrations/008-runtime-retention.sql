ALTER TABLE rpg_runtime_states
  ADD COLUMN finished_at BIGINT UNSIGNED NULL AFTER updated_at,
  ADD KEY idx_rpg_runtime_finished (finished_at);
