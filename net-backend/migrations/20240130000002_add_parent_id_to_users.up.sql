ALTER TABLE users ADD COLUMN parent_id INT NULL REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_users_parent_id ON users(parent_id);
