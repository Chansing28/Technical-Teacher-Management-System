const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
const uploadDir = path.join(__dirname, 'uploads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const db = new Database(path.join(dataDir, 'teachers.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  expertise TEXT NOT NULL,
  qualification TEXT NOT NULL,
  experience INTEGER NOT NULL DEFAULT 0,
  shift TEXT NOT NULL,
  telegram_id TEXT UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

const QUALIFICATIONS = ['Certificate', 'Diploma', 'Bachelor', 'Master', 'PhD'];
const SHIFTS = ['Morning', 'Afternoon', 'Evening', 'Full-day'];

const q = {
  list: (term) => {
    const like = `%${term || ''}%`;
    return db.prepare(`
      SELECT t.*, (SELECT COUNT(*) FROM documents d WHERE d.teacher_id = t.id) AS doc_count
      FROM teachers t
      WHERE t.name LIKE ? OR t.phone LIKE ? OR t.expertise LIKE ? OR t.qualification LIKE ? OR t.shift LIKE ?
      ORDER BY t.name COLLATE NOCASE`).all(like, like, like, like, like);
  },
  get: (id) => db.prepare('SELECT * FROM teachers WHERE id = ?').get(id),
  byTelegram: (tid) => db.prepare('SELECT * FROM teachers WHERE telegram_id = ?').get(String(tid)),
  create: (t) => db.prepare(`INSERT INTO teachers (name, phone, expertise, qualification, experience, shift, telegram_id)
      VALUES (@name, @phone, @expertise, @qualification, @experience, @shift, @telegram_id)`).run({
      telegram_id: null, ...t }).lastInsertRowid,
  update: (id, t) => db.prepare(`UPDATE teachers SET name=@name, phone=@phone, expertise=@expertise,
      qualification=@qualification, experience=@experience, shift=@shift WHERE id=@id`).run({ ...t, id }),
  remove: (id) => db.prepare('DELETE FROM teachers WHERE id = ?').run(id),
  docs: (tid) => db.prepare('SELECT * FROM documents WHERE teacher_id = ? ORDER BY id DESC').all(tid),
  doc: (id) => db.prepare('SELECT * FROM documents WHERE id = ?').get(id),
  addDoc: (tid, original, file) => db.prepare('INSERT INTO documents (teacher_id, original_name, file_name) VALUES (?,?,?)').run(tid, original, file),
  removeDoc: (id) => db.prepare('DELETE FROM documents WHERE id = ?').run(id),
  stats: () => ({
    total: db.prepare('SELECT COUNT(*) c FROM teachers').get().c,
    avgExp: db.prepare('SELECT ROUND(AVG(experience),1) a FROM teachers').get().a || 0,
    docs: db.prepare('SELECT COUNT(*) c FROM documents').get().c,
    byShift: db.prepare('SELECT shift, COUNT(*) c FROM teachers GROUP BY shift').all(),
  }),
};

function validate(t) {
  const name = String(t.name || '').trim();
  const phone = String(t.phone || '').trim();
  const expertise = String(t.expertise || '').trim();
  const experience = parseInt(t.experience, 10);
  if (!name || !phone || !expertise) return { error: 'Name, phone and expertise are required' };
  if (!QUALIFICATIONS.includes(t.qualification)) return { error: 'Invalid qualification level' };
  if (!SHIFTS.includes(t.shift)) return { error: 'Invalid teaching shift' };
  if (isNaN(experience) || experience < 0 || experience > 60) return { error: 'Experience must be 0-60 years' };
  return { value: { name, phone, expertise, qualification: t.qualification, experience, shift: t.shift } };
}

module.exports = { db, q, validate, uploadDir, QUALIFICATIONS, SHIFTS };
