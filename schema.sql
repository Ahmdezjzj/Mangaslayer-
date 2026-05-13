-- MangaPlus Database Schema
-- by abdou oran hsai bounif

CREATE TABLE IF NOT EXISTS manga (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  title_ar TEXT,
  description TEXT,
  description_ar TEXT,
  cover TEXT,
  status TEXT DEFAULT 'ongoing',
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  manga_id TEXT NOT NULL,
  number REAL NOT NULL,
  title TEXT,
  title_ar TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (manga_id) REFERENCES manga(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  order_num INTEGER NOT NULL,
  url TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chapters_manga ON chapters(manga_id);
CREATE INDEX IF NOT EXISTS idx_images_chapter ON images(chapter_id);
CREATE INDEX IF NOT EXISTS idx_chapters_number ON chapters(manga_id, number);
