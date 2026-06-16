require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

async function sendVoteEmail({ to, question, voteLink }) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="margin-top: 0;">You've been invited to respond to a survey</h2>
      <blockquote style="border-left: 4px solid #4f46e5; margin: 0 0 24px; padding: 12px 16px;
                         background: #f5f5ff; color: #1e1b4b; font-size: 1.1em;">
        ${escapeHtml(question)}
      </blockquote>
      <p>Click your personal link below to respond — it takes just one click:</p>
      <a href="${voteLink}"
         style="display: inline-block; background: #4f46e5; color: #fff;
                padding: 12px 24px; border-radius: 6px; text-decoration: none;
                font-weight: bold; font-size: 1em;">
        Respond to survey
      </a>
      <p style="margin-top: 24px; font-size: 0.85em; color: #666;">
        Or copy this link into your browser:<br>
        <a href="${voteLink}" style="color: #4f46e5;">${voteLink}</a>
      </p>
      <p style="font-size: 0.8em; color: #999;">
        This link is unique to you. You can only vote once.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Survey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Your opinion is requested — please respond',
    html,
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { sendVoteEmail };
