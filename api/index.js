require('dotenv').config();
const app = require('../app');
const { init } = require('../src/db');

// Fail fast if critical env vars are missing
const missing = ['TURSO_DATABASE_URL', 'ADMIN_EMAIL', 'ADMIN_PASSWORD_HASH', 'SESSION_SECRET']
  .filter(k => !process.env[k]);
if (missing.length) {
  console.error('[config] Missing env vars:', missing.join(', '));
}

let readyPromise = null;

function ensureReady() {
  if (readyPromise) return readyPromise;

  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error('DB init timed out after 8s — check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel env vars')),
      8000
    )
  );

  readyPromise = Promise.race([init(), timeout]).catch(err => {
    console.error('[db] init failed:', err.message);
    readyPromise = null; // reset so the next request retries
    throw err;
  });

  return readyPromise;
}

module.exports = async (req, res) => {
  try {
    await ensureReady();
  } catch (err) {
    res.status(503).send(`
      <h2>App unavailable</h2>
      <p><b>Reason:</b> ${err.message}</p>
      <p>Check the <b>Functions</b> tab in your Vercel dashboard for the full error.</p>
    `);
    return;
  }
  app(req, res);
};
