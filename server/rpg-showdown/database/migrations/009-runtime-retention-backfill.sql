UPDATE rpg_runtime_states
SET finished_at = CAST(JSON_UNQUOTE(JSON_EXTRACT(state, '$.finishedAt')) AS UNSIGNED)
WHERE JSON_EXTRACT(state, '$.finishedAt') IS NOT NULL;
