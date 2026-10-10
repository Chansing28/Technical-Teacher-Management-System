const express = require('express');
const session = require('express-session');
const multer = require('multer');
const ExcelJS = require('exceljs');
const path = require('path');
const crypto = require('crypto');
const { q, validate, uploadDir, QUALIFICATIONS, SHIFTS } = require('./db');

const ALLOWED = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) =>
    cb(null, crypto.randomBytes(12).toString('hex') + path.extname(file.originalname).toLowerCase()),
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    cb(ALLOWED.includes(path.extname(file.originalname).toLowerCase()) ? null : new Error('File type not allowed'),
      ALLOWED.includes(path.extname(file.originalname).toLowerCase())),
});

function createServer() {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 },
  }));

  const auth = (req, res, next) =>
    req.session.admin ? next() : res.status(401).json({ error: 'Not logged in' });

  // ---- Auth
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    if (username === (process.env.ADMIN_USER || 'admin') &&
        password === (process.env.ADMIN_PASSWORD || 'admin123')) {
      req.session.admin = true;
      return res.json({ ok: true });
    }
    res.status(401).json({ error: 'Wrong username or password' });
  });
  app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
  app.get('/api/me', (req, res) => res.json({ admin: !!req.session.admin }));
  app.get('/api/options', auth, (req, res) => res.json({ qualifications: QUALIFICATIONS, shifts: SHIFTS }));

  // ---- Teachers
  app.get('/api/stats', auth, (req, res) => res.json(q.stats()));
  app.get('/api/teachers', auth, (req, res) => res.json(q.list(req.query.q)));

  app.post('/api/teachers', auth, (req, res) => {
    const { value, error } = validate(req.body);
    if (error) return res.status(400).json({ error });
    res.json({ id: q.create(value) });
  });
  app.put('/api/teachers/:id', auth, (req, res) => {
    if (!q.get(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const { value, error } = validate(req.body);
    if (error) return res.status(400).json({ error });
    q.update(req.params.id, value);
    res.json({ ok: true });
  });
  app.delete('/api/teachers/:id', auth, (req, res) => {
    q.docs(req.params.id).forEach((d) => require('fs').unlink(path.join(uploadDir, d.file_name), () => {}));
    q.remove(req.params.id);
    res.json({ ok: true });
  });

  // ---- Documents
  app.get('/api/teachers/:id/documents', auth, (req, res) => res.json(q.docs(req.params.id)));
  app.post('/api/teachers/:id/documents', auth, (req, res) => {
    if (!q.get(req.params.id)) return res.status(404).json({ error: 'Teacher not found' });
    upload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No file received' });
      q.addDoc(req.params.id, req.file.originalname, req.file.filename);
      res.json({ ok: true });
    });
  });
  app.delete('/api/documents/:id', auth, (req, res) => {
    const d = q.doc(req.params.id);
    if (d) {
      require('fs').unlink(path.join(uploadDir, d.file_name), () => {});
      q.removeDoc(d.id);
    }
    res.json({ ok: true });
  });
  app.get('/files/:id', auth, (req, res) => {
    const d = q.doc(req.params.id);
    if (!d) return res.status(404).send('Not found');
    res.download(path.join(uploadDir, d.file_name), d.original_name);
  });

  // ---- Export
  app.get('/api/export/excel', auth, async (req, res) => {
    const rows = q.list(req.query.q);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Teachers');
    ws.columns = [
      { header: 'No.', key: 'no', width: 6 },
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Expertise', key: 'expertise', width: 28 },
      { header: 'Qualification', key: 'qualification', width: 16 },
      { header: 'Experience (yrs)', key: 'experience', width: 16 },
      { header: 'Shift', key: 'shift', width: 14 },
      { header: 'Documents', key: 'doc_count', width: 12 },
    ];
    rows.forEach((r, i) => ws.addRow({ no: i + 1, ...r }));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="teachers.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  });
  app.get('/api/export/csv', auth, (req, res) => {
    const rows = q.list(req.query.q);
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Name', 'Phone', 'Expertise', 'Qualification', 'Experience', 'Shift'];
    const lines = [header.join(',')].concat(
      rows.map((r) => [r.name, r.phone, r.expertise, r.qualification, r.experience, r.shift].map(esc).join(',')));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="teachers.csv"');
    res.send('\uFEFF' + lines.join('\n'));
  });

  app.use(express.static(path.join(__dirname, 'public')));
  return app;
}

module.exports = { createServer };
