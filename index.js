require('dotenv').config();
const { createServer } = require('./server');
const { createBot } = require('./bot');

const port = process.env.PORT || 3000;
createServer().listen(port, () => console.log(`Web dashboard: http://localhost:${port}`));

if (process.env.BOT_TOKEN && !process.env.BOT_TOKEN.includes('your-token')) {
  const bot = createBot(process.env.BOT_TOKEN);
  bot.launch().then(() => console.log('Telegram bot started'));
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
} else {
  console.log('BOT_TOKEN not set - running web dashboard only.');
}
