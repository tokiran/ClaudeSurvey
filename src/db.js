const url = process.env.TURSO_DATABASE_URL;

if (!url) {
  throw new Error(
    'TURSO_DATABASE_URL is not set.\n' +
    '  • Local dev: add TURSO_DATABASE_URL=file:./survey.db to your .env\n' +
    '  • Vercel: add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Project → Settings → Environment Variables'
  );
}

// For remote Turso URLs use the web (HTTP-only) client — no WASM binary,
// much faster cold starts on Vercel. For local file:// dev use the full client.
const { createClient } = url.startsWith('file:')
  ? require('@libsql/client')
  : require('@libsql/client/web');

const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

async function init() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS surveys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
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
}

module.exports = { client, init };
