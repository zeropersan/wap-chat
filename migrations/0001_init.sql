CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  attachment_path TEXT,
  attachment_name TEXT,
  attachment_mime TEXT,
  attachment_size INTEGER
);