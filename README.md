# Agree / Disagree Survey App

A small self-hosted survey tool. You (the admin) write a question, paste in a list of email addresses, send each person a unique one-click voting link, and watch results come in live.

---

## Quick start (local)

```bash
npm install
cp .env.example .env   # then fill in every value — see below
npm run hash-password  # generates ADMIN_PASSWORD_HASH
npm start              # http://localhost:3000
```

---

## Filling in `.env`

### Admin credentials

| Variable | What to put here |
|---|---|
| `ADMIN_EMAIL` | Your email address — used on the login form |
| `ADMIN_PASSWORD_HASH` | Output of `npm run hash-password` (a bcrypt hash) |
| `SESSION_SECRET` | Any long random string. Generate: `openssl rand -hex 32` |

### Database

**Local dev** — no setup needed, uses a local SQLite file:
```
TURSO_DATABASE_URL=file:./survey.db
TURSO_AUTH_TOKEN=
```

**Production** — see the [Turso setup](#turso-database-setup) section below.

### Gmail (App Password / SMTP)

| Variable | What to put here |
|---|---|
| `GMAIL_USER` | Your full Gmail address |
| `GMAIL_APP_PASSWORD` | A 16-character App Password (see below) |

**One-time Gmail setup:**

1. Enable **2-Step Verification**: Google Account → Security → 2-Step Verification.
2. Generate an App Password: Google Account → Security → **App passwords**
   - App: **Mail** / Device: **Other** (name it "Survey App") → **Generate**
   - Copy the 16-character password into `.env`.

> A normal Gmail password will be rejected. You _must_ use an App Password.

---

## Deploying to Vercel

### 1. Turso database setup

Turso is a free serverless SQLite service. The app schema is created automatically on first request.

```bash
# Install the Turso CLI
brew install tursodatabase/tap/turso

# Log in (creates an account if you don't have one)
turso auth login

# Create a database
turso db create survey-app

# Get your database URL
turso db show survey-app --url
# → libsql://survey-app-<your-org>.turso.io

# Create an auth token
turso db tokens create survey-app
# → eyJh...  (copy this)
```

Add these two values to Vercel's environment variables (step 3 below):
```
TURSO_DATABASE_URL=libsql://survey-app-<your-org>.turso.io
TURSO_AUTH_TOKEN=<token from above>
```

### 2. Push code to GitHub

```bash
git init
git add .
git commit -m "initial commit"
gh repo create survey-app --public --source=. --push
# or push to an existing repo
```

### 3. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your GitHub repo.
2. Vercel auto-detects the `vercel.json` — no framework preset needed.
3. Under **Environment Variables**, add every variable from `.env.example`:
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD_HASH`
   - `SESSION_SECRET`
   - `APP_BASE_URL` — set this to your Vercel URL, e.g. `https://survey-app.vercel.app`
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `GMAIL_USER`
   - `GMAIL_APP_PASSWORD`
4. Click **Deploy**.

After the first deploy, copy the production URL and update `APP_BASE_URL` in Vercel's environment variables to match (e.g. `https://survey-app.vercel.app`), then redeploy.

---

## Generating the admin password hash

```bash
npm run hash-password
```

Type your chosen password when prompted. Copy the printed `ADMIN_PASSWORD_HASH=...` line into `.env` (local) and into Vercel's environment variables (production).

---

## How it works

1. **Create a survey** — write the question and paste participant emails (one per line or comma-separated). Duplicates are removed automatically.
2. **Send emails** — click "Send / resend emails" on the results page. Each participant receives a unique link. Clicking "Send" again only emails people who haven't responded yet.
3. **Participants vote** — they click the link in their email, choose Agree or Disagree, and they're done. The link can only be used once.
4. **View results** — the results page shows totals, percentages, a visual bar, and a per-person breakdown.
5. **Close the survey** — once closed, existing links stop accepting votes.

---

## Sending limits

A free Gmail account can send roughly **500 emails per day**. For a class, team, or small group this is plenty. For larger audiences consider a transactional email service (Resend, SendGrid, Mailgun) and swap the transport in `src/email.js`.
