require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');

const adminRoutes = require('./src/routes/admin');
const voteRoutes = require('./src/routes/vote');

const app = express();

// Trust Vercel's reverse proxy so req.secure is true on HTTPS requests,
// which allows cookie-session to set the Secure flag correctly.
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(cookieSession({
  name: 'session',
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  // Set secure:true only in production so local http still works
  secure: process.env.NODE_ENV === 'production',
}));

app.use('/admin', adminRoutes);
app.use('/vote', voteRoutes);

app.get('/', (req, res) => res.redirect('/admin'));

app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found.' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { message: err.message || 'Something went wrong.' });
});

// Only start the listener when run directly (not when imported by Vercel)
if (require.main === module) {
  const { init } = require('./src/db');
  const PORT = process.env.PORT || 3000;
  init()
    .then(() => app.listen(PORT, () => console.log(`Survey app running at http://localhost:${PORT}`)))
    .catch(err => { console.error('DB init failed:', err); process.exit(1); });
}

module.exports = app;
