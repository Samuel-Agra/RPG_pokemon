UPDATE rpg_characters
SET state = JSON_SET(state, '$.trainerSheet', JSON_OBJECT(
  'version', 1,
  'status', 'pending',
  'attributes', NULL,
  'classId', NULL,
  'level', 1,
  'experience', 0,
  'hitPoints', JSON_OBJECT('current', NULL, 'maximum', NULL, 'temporary', 0),
  'skills', JSON_OBJECT('trained', JSON_ARRAY(), 'focused', JSON_ARRAY()),
  'resistances', JSON_ARRAY(),
  'talents', JSON_OBJECT('general', JSON_ARRAY(), 'class', JSON_ARRAY(), 'apex', NULL),
  'resources', JSON_OBJECT()
))
WHERE JSON_CONTAINS_PATH(state, 'one', '$.trainerSheet') = 0;
