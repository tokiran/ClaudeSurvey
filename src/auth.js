require('dotenv').config();
const bcrypt = require('bcrypt');

function requireAuth(req, res, next) {
  if (req.session && req.session.adminLoggedIn) return next();
  res.redirect('/admin/login');
}

async function checkPassword(plaintext) {
  return bcrypt.compare(plaintext, process.env.ADMIN_PASSWORD_HASH);
}

module.exports = { requireAuth, checkPassword };
