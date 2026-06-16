require('dotenv').config();
const { createClient } = require('@libsql/client');

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error('ERROR: TURSO_DATABASE_URL is not set in .env');
  process.exit(1);
}

console.log('Connecting to:', url);

const client = createClient({ url, authToken: authToken || undefined });

async function run() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS surveys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✓ surveys table');

  await client.execute(`
    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      survey_id INTEGER NOT NULL REFERENCES surveys(id),
      email TEXT NOT NULL,
      vote_token TEXT NOT NULL UNIQUE,
      responded INTEGER NOT NULL DEFAULT 0,
      response TEXT,
      responded_at DATETIME,
      UNIQUE(survey_id, email)
    )
  `);
  console.log('✓ participants table');

  const result = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  );
  console.log('Tables in database:', result.rows.map(r => r.name).join(', ') || '(none)');
  console.log('Migration complete.');
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
