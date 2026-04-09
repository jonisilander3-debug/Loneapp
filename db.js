const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, 'data', 'loneapp.db');
let db;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  db.run('PRAGMA foreign_keys = ON');
  return db;
}

function saveDb() {
  if (!db) return;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// Auto-save every 30 seconds
setInterval(saveDb, 30000);

async function initDb() {
  const database = await getDb();

  database.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','reader')),
      display_name TEXT NOT NULL
    )
  `);
  database.run(`CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  database.run(`CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      nickname TEXT UNIQUE,
      iban TEXT,
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  database.run(`CREATE TABLE IF NOT EXISTS employee_projects (
      employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      PRIMARY KEY (employee_id, project_id)
  )`);
  database.run(`CREATE TABLE IF NOT EXISTS reader_projects (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, project_id)
  )`);
  database.run(`CREATE TABLE IF NOT EXISTS weeks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      week_number INTEGER NOT NULL,
      locked INTEGER DEFAULT 0,
      locked_at DATETIME,
      locked_by INTEGER REFERENCES users(id),
      UNIQUE(year, week_number)
  )`);
  database.run(`CREATE TABLE IF NOT EXISTS chat_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_id INTEGER REFERENCES weeks(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      date TEXT,
      total_message REAL DEFAULT 0,
      live_message REAL DEFAULT 0,
      reminders REAL DEFAULT 0,
      asa REAL DEFAULT 0,
      matched REAL DEFAULT 0,
      customer_answers REAL DEFAULT 0,
      average_time REAL DEFAULT 0,
      effectiveness TEXT DEFAULT '0 %',
      earnings REAL DEFAULT 0,
      average_char_count REAL DEFAULT 0
  )`);
  database.run(`CREATE TABLE IF NOT EXISTS affiliate_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_id INTEGER REFERENCES weeks(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      paid_earning REAL DEFAULT 0,
      unpaid_earnings REAL DEFAULT 0,
      total_sales REAL DEFAULT 0,
      rate TEXT DEFAULT '0 %'
  )`);
  database.run(`CREATE TABLE IF NOT EXISTS salary_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_id INTEGER REFERENCES weeks(id) ON DELETE CASCADE,
      employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
      delad_affe REAL DEFAULT 0,
      bonus REAL DEFAULT 0,
      admin_pay REAL DEFAULT 0,
      avdrag REAL DEFAULT 0,
      UNIQUE(week_id, employee_id)
  )`);

  // Seed users
  const res = database.exec('SELECT COUNT(*) as count FROM users');
  const userCount = res.length ? res[0].values[0][0] : 0;
  if (userCount === 0) {
    const hash = bcrypt.hashSync('changeme', 10);
    const seedUsers = [
      ['joni', hash, 'admin', 'Joni'],
      ['daniel', hash, 'admin', 'Daniel'],
      ['peter', hash, 'admin', 'Peter'],
      ['martin', hash, 'reader', 'Martin'],
      ['per', hash, 'reader', 'Per'],
      ['kim', hash, 'reader', 'Kim'],
      ['jaatak', hash, 'reader', 'Jaatak'],
      ['dino', hash, 'reader', 'Dino'],
    ];
    for (const u of seedUsers) {
      database.run('INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)', u);
    }
    console.log('Anvandare skapade');
  }

  const res2 = database.exec('SELECT COUNT(*) as count FROM projects');
  const projCount = res2.length ? res2[0].values[0][0] : 0;
  if (projCount === 0) {
    database.run('INSERT INTO projects (name) VALUES (?)', ['Projekt Alpha']);
    database.run('INSERT INTO projects (name) VALUES (?)', ['Projekt Beta']);
    console.log('Standardprojekt skapade');
  }

  saveDb();
  return database;
}

module.exports = { getDb, initDb, saveDb };
