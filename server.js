const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcrypt');
const path = require('path');
const { getDb, initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, 'data') }),
  secret: process.env.SESSION_SECRET || 'loneapp-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true }
}));

// ── Auth helpers ─────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Inte inloggad' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Inte inloggad' });
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Endast admin' });
  next();
}

function getOrCreateWeek(db, year, week) {
  let row = db.prepare('SELECT * FROM weeks WHERE year=? AND week_number=?').get(year, week);
  if (!row) {
    db.prepare('INSERT INTO weeks (year, week_number) VALUES (?, ?)').run(year, week);
    row = db.prepare('SELECT * FROM weeks WHERE year=? AND week_number=?').get(year, week);
  }
  return row;
}

// ── Auth routes ──────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Användarnamn och lösenord krävs' });
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Fel användarnamn eller lösenord' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  req.session.displayName = user.display_name;
  res.json({ user: { id: user.id, username: user.username, role: user.role, display_name: user.display_name } });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, username, role, display_name FROM users WHERE id=?').get(req.session.userId);
  res.json({ user });
});

// ── Projects ─────────────────────────────────────────────────────────────────
app.get('/api/projects', requireAuth, (req, res) => {
  const db = getDb();
  const projects = db.prepare('SELECT p.*, (SELECT COUNT(*) FROM employee_projects ep WHERE ep.project_id = p.id) as employee_count ORDER BY p.name').all();
  res.json(projects);
});

app.post('/api/projects', requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Namn krävs' });
  const db = getDb();
  const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
  res.json({ id: result.lastInsertRowid, name });
});

app.put('/api/projects/:id', requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Namn krävs' });
  const db = getDb();
  db.prepare('UPDATE projects SET name=? WHERE id=?').run(name, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/projects/:id', requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Employees ────────────────────────────────────────────────────────────────
app.get('/api/employees', requireAuth, (req, res) => {
  const { year, week } = req.query;
  const db = getDb();
  let employees;
  if (req.session.role === 'admin') {
    employees = db.prepare('SELECT * FROM employees ORDER BY name').all();
  } else {
    employees = db.prepare("SELECT DISTINCT e.* FROM employees e JOIN reader_projects rp ON rp.user_id = ? JOIN employee_projects ep ON ep.employee_id = e.id AND ep.project_id = rp.project_id ORDER BY e.name").all(req.session.userId);
  }
  // Attach project assignments and salary data per employee
  for (const emp of employees) {
    emp.projects = db.prepare('SELECT project_id FROM employee_projects WHERE employee_id=?').all(emp.id).map(r => r.project_id);
    if (year && week) {
      const weekRow = db.prepare('SELECT * FROM weeks WHERE year=? AND week_number=?').get(year, week);
      if (weekRow) {
        const chatTotals = db.prepare('SELECT COALESCE(SUM(cd.earnings), 0) as total FROM chat_data cd JOIN employee_projects ep ON ep.project_id = cd.project_id WHERE ep.employee_id = ? AND cd.week_id = ? AND cd.username = ?').get(emp.id, weekRow.id, emp.nickname || emp.name);
        const affTotals = db.prepare('SELECT COALESCE(SUM(ad.paid_earning), 0) as total FROM affiliate_data ad JOIN employee_projects ep ON ep.project_id = ad.project_id WHERE ep.employee_id = ? AND ad.week_id = ? AND ad.username = ?').get(emp.id, weekRow.id, emp.nickname || emp.name);
        emp.totalEarnings = chatTotals ? chatTotals.total : 0;
        emp.totalAffiliate = affTotals ? affTotals.total : 0;
      }
    }
  }
  res.json(employees);
});

app.post('/api/employees', requireAdmin, (req, res) => {
  const { name, nickname, email, iban, projectIds } = req.body;
  if (!name) return res.status(400).json({ error: 'Namn krävs' });
  const db = getDb();
  const result = db.prepare('INSERT INTO employees (name, nickname, email, iban) VALUES (?, ?, ?, ?)').run(name, nickname || null, email || null, iban || null);
  const empId = result.lastInsertRowid;
  if (projectIds && projectIds.length) {
    const ins = db.prepare('INSERT INTO employee_projects (employee_id, project_id) VALUES (?, ?)');
    for (const pid of projectIds) ins.run(empId, pid);
  }
  res.json({ id: empId });
});

app.put('/api/employees/:id', requireAdmin, (req, res) => {
  const { name, nickname, email, iban, projectIds } = req.body;
  const db = getDb();
  db.prepare('UPDATE employees SET name=?, nickname=?, email=?, iban=? WHERE id=?').run(name||'', nickname||null, email||null, iban||null, req.params.id);
  db.prepare('DELETE FROM employee_projects WHERE employee_id=?').run(req.params.id);
  if (projectIds && projectIds.length) {
    const ins = db.prepare('INSERT INTO employee_projects (employee_id, project_id) VALUES (?, ?)');
    for (const pid of projectIds) ins.run(req.params.id, pid);
  }
  res.json({ ok: true });
});

app.delete('/api/employees/:id', requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM employees WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Chat data ────────────────────────────────────────────────────────────────
app.get('/api/chat-data', requireAuth, (req, res) => {
  const { year, week, projectId } = req.query;
  if (!year || !week || !projectId) return res.status(400).json({ error: 'Saknar parametrar' });
  const db = getDb();
  const weekRow = db.prepare('SELECT * FROM weeks WHERE year=? AND week_number=?').get(year, week);
  if (!weekRow) return res.json([]);
  res.json(db.prepare('SELECT * FROM chat_data WHERE week_id=? AND project_id=? ORDER BY id').all(weekRow.id, projectId));
});

app.post('/api/chat-data', requireAdmin, (req, res) => {
  const { year, week, projectId, data } = req.body;
  if (!year || !week || !projectId) return res.status(400).json({ error: 'Saknar parametrar' });
  const db = getDb();
  const weekRow = getOrCreateWeek(db, parseInt(year), parseInt(week));
  if (weekRow.locked) return res.status(403).json({ error: 'Veckans data är låst' });
  db.prepare('DELETE FROM chat_data WHERE week_id=? AND project_id=?').run(weekRow.id, projectId);
  const insert = db.prepare('INSERT INTO chat_data (week_id, project_id, username, date, total_message, live_message, reminders, asa, matched, customer_answers, average_time, effectiveness, earnings, average_char_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of (data || [])) {
    insert.run(weekRow.id, projectId, row.Username || row.username || '', row.Date || row.date || '',
      parseFloat(row['Total Message']) || parseFloat(row.total_message) || 0,
      parseFloat(row['Live Message']) || parseFloat(row.live_message) || 0,
      parseFloat(row.Reminders) || parseFloat(row.reminders) || 0,
      parseFloat(row.ASA) || parseFloat(row.asa) || 0,
      parseFloat(row.Matched) || parseFloat(row.matched) || 0,
      parseFloat(row['Customer Answers']) || parseFloat(row.customer_answers) || 0,
      parseFloat(row['Average Time']) || parseFloat(row.average_time) || 0,
      row.Effectiveness || row.effectiveness || '0 %',
      parseFloat(row.Earnings) || parseFloat(row.earnings) || 0,
      parseFloat(row['Average Char Count']) || parseFloat(row.average_char_count) || 0);
  }
  res.json({ ok: true });
});

// ── Affiliate data ───────────────────────────────────────────────────────────
app.get('/api/affiliate-data', requireAuth, (req, res) => {
  const { year, week, projectId } = req.query;
  if (!year || !week || !projectId) return res.status(400).json({ error: 'Saknar parametrar' });
  const db = getDb();
  const weekRow = db.prepare('SELECT * FROM weeks WHERE year=? AND week_number=?').get(year, week);
  if (!weekRow) return res.json([]);
  res.json(db.prepare('SELECT * FROM affiliate_data WHERE week_id=? AND project_id=? ORDER BY id').all(weekRow.id, projectId));
});

app.post('/api/affiliate-data', requireAdmin, (req, res) => {
  const { year, week, projectId, data } = req.body;
  if (!year || !week || !projectId) return res.status(400).json({ error: 'Saknar parametrar' });
  const db = getDb();
  const weekRow = getOrCreateWeek(db, parseInt(year), parseInt(week));
  if (weekRow.locked) return res.status(403).json({ error: 'Veckans data är låst' });
  db.prepare('DELETE FROM affiliate_data WHERE week_id=? AND project_id=?').run(weekRow.id, projectId);
  const insert = db.prepare('INSERT INTO affiliate_data (week_id, project_id, username, paid_earning, unpaid_earnings, total_sales, rate) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const row of (data || [])) {
    insert.run(weekRow.id, projectId, row.Username || row.username || '',
      parseFloat(row['Paid Earning']) || parseFloat(row.paid_earning) || 0,
      parseFloat(row['Unpaid Earnings']) || parseFloat(row.unpaid_earnings) || 0,
      parseFloat(row['Total Sales']) || parseFloat(row.total_sales) || 0,
      row.Rate || row.rate || '0 %');
  }
  res.json({ ok: true });
});

// ── Salary adjustments ──────────────────────────────────────────────────────
app.get('/api/salary-adjustments', requireAuth, (req, res) => {
  const { year, week, employeeId } = req.query;
  if (!year || !week || !employeeId) return res.status(400).json({ error: 'Saknar parametrar' });
  const db = getDb();
  const weekRow = db.prepare('SELECT * FROM weeks WHERE year=? AND week_number=?').get(year, week);
  if (!weekRow) return res.json(null);
  const adj = db.prepare('SELECT * FROM salary_adjustments WHERE week_id=? AND employee_id=?').get(weekRow.id, employeeId);
  res.json(adj || null);
});

app.post('/api/salary-adjustments', requireAdmin, (req, res) => {
  const { year, week, employeeId, delad_affe, bonus, admin_pay, avdrag } = req.body;
  if (!year || !week || !employeeId) return res.status(400).json({ error: 'Saknar parametrar' });
  const db = getDb();
  const weekRow = getOrCreateWeek(db, parseInt(year), parseInt(week));
  if (weekRow.locked) return res.status(403).json({ error: 'Veckans data är låst' });
  db.prepare('INSERT INTO salary_adjustments (week_id, employee_id, delad_affe, bonus, admin_pay, avdrag) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(week_id, employee_id) DO UPDATE SET delad_affe=excluded.delad_affe, bonus=excluded.bonus, admin_pay=excluded.admin_pay, avdrag=excluded.avdrag').run(
    weekRow.id, employeeId,
    parseFloat(delad_affe) || 0,
    parseFloat(bonus) || 0,
    parseFloat(admin_pay) || 0,
    parseFloat(avdrag) || 0
  );
  res.json({ ok: true });
});

// ── Salary export ────────────────────────────────────────────────────────────
app.get('/api/salary-export', requireAuth, (req, res) => {
  const { year, week } = req.query;
  if (!year || !week) return res.status(400).json({ error: 'Saknar parametrar' });
  const db = getDb();
  const weekRow = db.prepare('SELECT * FROM weeks WHERE year=? AND week_number=?').get(year, week);
  if (!weekRow) return res.json([]);
  let employees;
  if (req.session.role === 'admin') {
    employees = db.prepare('SELECT * FROM employees ORDER BY name').all();
  } else {
    employees = db.prepare("SELECT DISTINCT e.* FROM employees e JOIN reader_projects rp ON rp.user_id = ? JOIN employee_projects ep ON ep.employee_id = e.id AND ep.project_id = rp.project_id ORDER BY e.name").all(req.session.userId);
  }
  const result = [];
  for (const emp of employees) {
    const chatTotals = db.prepare('SELECT COALESCE(SUM(cd.earnings), 0) as total FROM chat_data cd JOIN employee_projects ep ON ep.project_id = cd.project_id WHERE ep.employee_id = ? AND cd.week_id = ? AND cd.username = ?').get(emp.id, weekRow.id, emp.nickname || emp.name);
    const affTotals = db.prepare('SELECT COALESCE(SUM(ad.paid_earning), 0) as total FROM affiliate_data ad JOIN employee_projects ep ON ep.project_id = ad.project_id WHERE ep.employee_id = ? AND ad.week_id = ? AND ad.username = ?').get(emp.id, weekRow.id, emp.nickname || emp.name);
    const adj = db.prepare('SELECT * FROM salary_adjustments WHERE week_id=? AND employee_id=?').get(weekRow.id, emp.id);
    const chatt = parseFloat(chatTotals ? chatTotals.total : 0);
    const affiliate = parseFloat(affTotals ? affTotals.total : 0);
    const deladAffe = adj ? parseFloat(adj.delad_affe)||0 : 0;
    const bonus = adj ? parseFloat(adj.bonus)||0 : 0;
    const adminPay = adj ? parseFloat(adj.admin_pay)||0 : 0;
    const avdrag = adj ? parseFloat(adj.avdrag)||0 : 0;
    const total = chatt + affiliate + deladAffe + bonus + adminPay - avdrag;
    result.push({ name: emp.name, nickname: emp.nickname, iban: emp.iban, email: emp.email, chatt, affiliate, delad_affe: deladAffe, bonus, admin_pay: adminPay, avdrag, total: Math.round(total * 100) / 100 });
  }
  res.json(result);
});

// ── Finalize week ────────────────────────────────────────────────────────────
app.post('/api/finalize-week', requireAdmin, (req, res) => {
  const { year, week } = req.body;
  if (!year || !week) return res.status(400).json({ error: 'Saknar parametrar' });
  const db = getDb();
  const weekRow = getOrCreateWeek(db, parseInt(year), parseInt(week));
  if (weekRow.locked) return res.status(400).json({ error: 'Veckans data är redan låst' });
  db.prepare('UPDATE weeks SET locked=1, locked_at=CURRENT_TIMESTAMP, locked_by=? WHERE id=?').run(req.session.userId, weekRow.id);
  res.json({ ok: true });
});

// ── Locked weeks ────────────────────────────────────────────────────────────
app.get('/api/locked-weeks', requireAuth, (req, res) => {
  const db = getDb();
  const weeks = db.prepare('SELECT * FROM weeks WHERE locked=1').all();
  res.json(weeks);
});

// ── Users (readers) ──────────────────────────────────────────────────────────
app.get('/api/users', requireAdmin, (req, res) => {
  const { role } = req.query;
  const db = getDb();
  let users;
  if (role === 'reader') {
    users = db.prepare('SELECT id, username, display_name, role FROM users WHERE role=? ORDER BY display_name').all('reader');
  } else {
    users = db.prepare('SELECT id, username, display_name, role FROM users ORDER BY display_name').all();
  }
  for (const u of users) {
    u.project_ids = db.prepare('SELECT project_id FROM reader_projects WHERE user_id=?').all(u.id).map(r => r.project_id);
  }
  res.json(users);
});

// ── Reader projects ─────────────────────────────────────────────────────────
app.post('/api/reader-projects', requireAdmin, (req, res) => {
  const db = getDb();
  const updates = req.body; // { userId: [projectId, ...], ... }
  for (const [userId, projectIds] of Object.entries(updates)) {
    db.prepare('DELETE FROM reader_projects WHERE user_id=?').run(parseInt(userId));
    if (projectIds && projectIds.length) {
      const ins = db.prepare('INSERT INTO reader_projects (user_id, project_id) VALUES (?, ?)');
      for (const pid of projectIds) ins.run(parseInt(userId), pid);
    }
  }
  res.json({ ok: true });
});

// ── Catch-all (SPA) ─────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ───────────────────────────────────────────────────────────────────
initDb();
app.listen(PORT, () => {
  console.log('Loneapp kor pa http://localhost:' + PORT);
});
