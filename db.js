const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, 'data', 'loneapp.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','reader')),
      display_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      nickname TEXT UNIQUE,
      iban TEXT,
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS employee_projects (
      employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      PRIMARY KEY (employee_id, project_id)
    );

    CREATE TABLE IF NOT EXISTS reader_projects (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, project_id)
    );

    CREATE TABLE IF NOT EXISTS weeks (
      id INTEGER PRIMARY KEY,
      year INTEGER NOT NULL,
      week_number INTEGER NOT NULL,
      locked INTEGER DEFAULT 0,
      locked_at DATETIME,
      locked_by INTEGER REFERENCES users(id),
      UNIQUE(year, week_number)
    );

    CREATE TABLE IF NOT EXISTS chat_data (
      id INTEGER PRIMARY KEY,
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
    );

    CREATE TABLE IF NOT EXISTS affiliate_data (
      id INTEGER PRIMARY KEY,
      week_id INTEGER REFERENCES weeks(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      paid_earning REAL DEFAULT 0,
      unpaid_earnings REAL DEFAULT 0,
      total_sales REAL DEFAULT 0,
      rate TEXT DEFAULT '0 %'
    );

    CREATE TABLE IF NOT EXISTS salary_adjustments (
      id INTEGER PRIMARY KEY,
      week_id INTEGER REFERENCES weeks(id) ON DELETE CASCADE,
      employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
      delad_affe REAL DEFAULT 0,
      bonus REAL DEFAULT 0,
      admin_pay REAL DEFAULT 0,
      avdrag REAL DEFAULT 0,
      UNIQUE(week_id, employee_id)
    );
  `);

  // Seed users if none exist
  const userCount = database.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const hash = bcrypt.hashSync('changeme', 10);
    const insertUser = database.prepare(
      'INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)'
    );
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
    for (const u of seedUsers) insertUser.run(u);
    console.log('✓ Användare skapade');
  }

  // Seed some default projects if none exist
  const projectCount = database.prepare('SELECT COUNT(*) as count FROM projects').get();
  if (projectCount.count === 0) {
    const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
    insertProject.run('Projekt Alpha');
    insertProject.run('Projekt Beta');
    console.log('✓ Standardprojekt skapade');
  }

  return database;
}

module.exports = { getDb, initDb };
