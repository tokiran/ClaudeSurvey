const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { client } = require('../db');
const { requireAuth, checkPassword } = require('../auth');

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
  res.redirect('/admin/new');
}));

router.post('/logout', requireAuth, (req, res) => {
  req.session = null;
  res.redirect('/admin/login');
});

// ── Dashboard ────────────────────────────────────────────────────────────────

router.get('/', requireAuth, wrap(async (req, res) => {
  const result = await client.execute({
    sql: `SELECT
            id, question, subject, status, created_at,
            (SELECT COUNT(*) FROM participants WHERE survey_id = surveys.id) AS total,
            (SELECT COALESCE(SUM(responded), 0) FROM participants WHERE survey_id = surveys.id) AS responded
          FROM surveys
          ORDER BY created_at DESC`,
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

  const r = await client.execute({
    sql: 'INSERT INTO surveys (question, subject) VALUES (?, ?)',
    args: [question, subject],
  });
  const surveyId = Number(r.lastInsertRowid);
  for (const email of emails) {
    const token = crypto.randomBytes(32).toString('hex');
    await client.execute({
      sql: 'INSERT INTO participants (survey_id, email, vote_token) VALUES (?, ?, ?)',
      args: [surveyId, email, token],
    });
  }

  res.redirect('/admin');
}));

// ── Survey results ───────────────────────────────────────────────────────────

router.get('/survey', requireAuth, (req, res) => res.redirect('/admin'));

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
    return res.redirect(`/admin/survey/${req.params.id}`);
  }

  const pendingResult = await client.execute({
    sql: 'SELECT email, vote_token FROM participants WHERE survey_id = ? AND responded = 0',
    args: [req.params.id],
  });

  const base = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
  let sent = 0;
  const errors = [];

  for (const p of pendingResult.rows) {
    const voteLink = `${base}/vote/${p.vote_token}`;
    try {
      await sendEmail({
        to: p.email,
        subject: survey.subject,
        question: survey.question,
        voteLink,
      });
      sent++;
    } catch (err) {
      errors.push(`${p.email}: ${err.message}`);
    }
  }

  if (errors.length) {
    console.error('[send] email errors:', errors.join(' | '));
  }
  req.session.flash = errors.length
    ? `Sent ${sent} email(s). Errors: ${errors.join('; ')}`
    : `Sent ${sent} email(s) successfully.`;
  res.redirect(`/admin/survey/${req.params.id}`);
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

// ── Email ─────────────────────────────────────────────────────────────────────

async function sendEmail({ to, subject, question, voteLink }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD are not configured in environment variables.');
  }
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="margin-top:0;">You've been invited to respond to a survey</h2>
      <blockquote style="border-left:4px solid #4f46e5;margin:0 0 24px;padding:12px 16px;
                         background:#f5f5ff;color:#1e1b4b;font-size:1.1em;">
        ${question.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
      </blockquote>
      <p>Click your personal link below to respond — it takes just one click:</p>
      <a href="${voteLink}"
         style="display:inline-block;background:#4f46e5;color:#fff;
                padding:12px 24px;border-radius:6px;text-decoration:none;
                font-weight:bold;font-size:1em;">
        Respond to survey
      </a>
      <p style="margin-top:24px;font-size:0.85em;color:#666;">
        Or copy this link into your browser:<br>
        <a href="${voteLink}" style="color:#4f46e5;">${voteLink}</a>
      </p>
      <p style="font-size:0.8em;color:#999;">This link is unique to you. You can only vote once.</p>
    </div>
  `;
  try {
    await transporter.sendMail({
      from: `"Survey" <${process.env.GMAIL_USER}>`,
      to,
      subject: subject || 'Your opinion is requested — please respond',
      html,
    });
  } finally {
    transporter.close();
  }
}

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
