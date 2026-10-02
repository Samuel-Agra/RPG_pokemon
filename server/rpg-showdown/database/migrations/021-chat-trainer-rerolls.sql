ALTER TABLE rpg_table_chat_messages MODIFY COLUMN message TEXT NOT NULL;
ALTER TABLE rpg_table_chat_messages ADD COLUMN reroll_talent VARCHAR(24) NULL;
