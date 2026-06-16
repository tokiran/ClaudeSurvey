const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { client } = require('../db');
const { requireAuth, checkPassword } = require('../auth');
const { sendVoteEmail } = require('../email');

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ── Login ────────────────────────────────────────────────────────────────────

router.get('/login', (req, res) => {
  if (req.session.adminLoggedIn) return res.redirect('/admin');
  res.render('admin/login', { error: null });
});

router.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  const emailMatch = email === process.env.ADMIN_EMAIL;
  const passwordMatch = emailMatch && (await checkPassword(password));

  if (!emailMatch || !passwordMatch) {
    return res.render('admin/login', { error: 'Invalid email or password.' });
  }

  req.session.adminLoggedIn = true;
  res.redirect('/admin');
}));

router.post('/logout', requireAuth, (req, res) => {
  req.session = null;
  res.redirect('/admin/login');
});

// ── Dashboard ────────────────────────────────────────────────────────────────

router.get('/', requireAuth, wrap(async (req, res) => {
  const result = await client.execute({
    sql: `SELECT s.*, COUNT(p.id) AS total, SUM(p.responded) AS responded
          FROM surveys s
          LEFT JOIN participants p ON p.survey_id = s.id
          GROUP BY s.id
          ORDER BY s.created_at DESC`,
    args: [],
  });
  res.render('admin/dashboard', { surveys: result.rows });
}));

// ── New survey ───────────────────────────────────────────────────────────────

router.get('/new', requireAuth, (req, res) => {
  res.render('admin/new', { error: null });
});

router.post('/new', requireAuth, wrap(async (req, res) => {
  const question = (req.body.question || '').trim();
  const subject = (req.body.subject || '').trim() || 'Your opinion is requested — please respond';
  const rawEmails = req.body.emails || '';

  if (!question) {
    return res.render('admin/new', { error: 'Please enter a question.' });
  }

  const emails = parseEmails(rawEmails);
  if (emails.length === 0) {
    return res.render('admin/new', { error: 'Please enter at least one valid email address.' });
  }

  const tx = await client.transaction('write');
  let surveyId;
  try {
    const r = await tx.execute({
      sql: 'INSERT INTO surveys (question, subject) VALUES (?, ?)',
      args: [question, subject],
    });
    surveyId = Number(r.lastInsertRowid);
    for (const email of emails) {
      const token = crypto.randomBytes(32).toString('hex');
      await tx.execute({
        sql: 'INSERT INTO participants (survey_id, email, vote_token) VALUES (?, ?, ?)',
        args: [surveyId, email, token],
      });
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }

  res.redirect(`/admin/survey/${surveyId}`);
}));

// ── Survey results ───────────────────────────────────────────────────────────

router.get('/survey/:id', requireAuth, wrap(async (req, res) => {
  const surveyResult = await client.execute({
    sql: 'SELECT * FROM surveys WHERE id = ?',
    args: [req.params.id],
  });
  const survey = surveyResult.rows[0];
  if (!survey) return res.status(404).render('error', { message: 'Survey not found.' });

  const pResult = await client.execute({
    sql: `SELECT email, responded, response, responded_at
          FROM participants WHERE survey_id = ?
          ORDER BY email ASC`,
    args: [survey.id],
  });
  const participants = pResult.rows;

  const total = participants.length;
  const responded = participants.filter(p => p.responded).length;
  const agree = participants.filter(p => p.response === 'agree').length;
  const disagree = participants.filter(p => p.response === 'disagree').length;
  const pct = n => (responded === 0 ? 0 : Math.round((n / responded) * 100));

  const flash = req.session.flash || null;
  delete req.session.flash;

  res.render('admin/survey', {
    survey,
    participants,
    stats: { total, responded, agree, disagree, agreePct: pct(agree), disagreePct: pct(disagree) },
    flash,
  });
}));

// ── Send emails ──────────────────────────────────────────────────────────────

router.post('/survey/:id/send', requireAuth, wrap(async (req, res) => {
  const surveyResult = await client.execute({
    sql: 'SELECT * FROM surveys WHERE id = ?',
    args: [req.params.id],
  });
  const survey = surveyResult.rows[0];
  if (!survey) return res.status(404).render('error', { message: 'Survey not found.' });

  if (survey.status === 'closed') {
    req.session.flash = 'Survey is closed; no emails sent.';
    return res.redirect(`/admin/survey/${survey.id}`);
  }

  const pendingResult = await client.execute({
    sql: 'SELECT email, vote_token FROM participants WHERE survey_id = ? AND responded = 0',
    args: [survey.id],
  });

  const base = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
  let sent = 0;
  const errors = [];

  for (const p of pendingResult.rows) {
    const voteLink = `${base}/vote/${p.vote_token}`;
    try {
      await sendVoteEmail({ to: p.email, subject: survey.subject, question: survey.question, voteLink });
      sent++;
    } catch (err) {
      errors.push(`${p.email}: ${err.message}`);
    }
  }

  req.session.flash = errors.length
    ? `Sent ${sent} email(s). Errors: ${errors.join('; ')}`
    : `Sent ${sent} email(s) successfully.`;
  res.redirect(`/admin/survey/${survey.id}`);
}));

// ── Close survey ─────────────────────────────────────────────────────────────

router.post('/survey/:id/close', requireAuth, wrap(async (req, res) => {
  await client.execute({
    sql: "UPDATE surveys SET status = 'closed' WHERE id = ?",
    args: [req.params.id],
  });
  req.session.flash = 'Survey closed. Existing vote links will no longer work.';
  res.redirect(`/admin/survey/${req.params.id}`);
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseEmails(raw) {
  const seen = new Set();
  return raw
    .split(/[\n,]+/)
    .map(s => s.trim().toLowerCase())
    .filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    .filter(s => {
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    });
}

module.exports = router;
