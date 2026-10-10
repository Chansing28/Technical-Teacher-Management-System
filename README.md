# Technical Teacher Management System

Web dashboard + Telegram bot. Both use the same SQLite database.

## What it stores
Name, phone, area of expertise, qualification level, years of experience, teaching shift, and uploaded qualification documents (PDF, JPG, PNG, DOC, DOCX, max 10 MB).

## Step 1: Install Node.js
Download Node.js 18 or newer from https://nodejs.org and check: `node -v`

## Step 2: Create your Telegram bot
1. Open Telegram, search **@BotFather**, send `/newbot`.
2. Choose a name and a username ending in `bot`.
3. Copy the token it gives you.
4. Search **@userinfobot**, press Start, and copy your numeric ID (this makes you a bot admin).

## Step 3: Install the project
```
cd teacher-system
npm install
```

## Step 4: Configure
Copy `.env.example` to `.env` and edit it:
```
ADMIN_USER=admin
ADMIN_PASSWORD=your-strong-password
SESSION_SECRET=any-long-random-text
BOT_TOKEN=token-from-botfather
ADMIN_IDS=your-telegram-id
```

## Step 5: Run
```
npm start
```
- Dashboard: http://localhost:3000 (login with ADMIN_USER / ADMIN_PASSWORD)
- Bot: open your bot in Telegram and press Start.

## How to use

**Teachers (Telegram bot)**
- `📝 Register / Update`: 6 quick questions (name, phone, expertise, qualification, experience, shift)
- `📎 Upload Document`: then send the file or a photo
- `👤 My Profile`: view saved data

**Admins (Telegram bot)**: `/list`, `/search word`, `/export` (Excel file)

**Admins (website)**: add/edit/delete teachers, search, view and upload documents, print the list or a single profile, export Excel/CSV.

## Project structure
```
index.js        starts web server + bot
db.js           SQLite tables and queries
server.js       REST API, login, uploads, exports
bot.js          Telegram bot
public/         website (index.html, style.css, app.js)
data/           database file (auto-created)
uploads/        uploaded documents (auto-created)
```

## Put it online (optional)
Run it on a VPS or a host such as Render/Railway with a persistent disk for `data/` and `uploads/`. Put it behind HTTPS (for example Nginx or Caddy) and use a strong ADMIN_PASSWORD.

## Security notes
- Change the default password before going live.
- Uploaded files get random names and are only downloadable by logged-in admins.
- Teachers can only edit their own record through the bot.
