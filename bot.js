const { Telegraf, Markup } = require('telegraf');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { q, validate, uploadDir, QUALIFICATIONS, SHIFTS } = require('./db');

const STEPS = ['name', 'phone', 'expertise', 'qualification', 'experience', 'shift'];
const PROMPTS = {
  name: '1/6  Your full name?',
  phone: '2/6  Your phone number? (or tap the button)',
  expertise: '3/6  Area of expertise? (e.g. Electrical, IT, Welding)',
  qualification: '4/6  Choose your qualification level:',
  experience: '5/6  Years of experience? (number)',
  shift: '6/6  Choose your teaching shift:',
};
const MAX_FILE = 10 * 1024 * 1024;
const ALLOWED = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];

function createBot(token) {
  const bot = new Telegraf(token);
  const admins = (process.env.ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const isAdmin = (ctx) => admins.includes(String(ctx.from.id));
  const forms = new Map(); // telegram id -> { step, data, editId }

  const mainMenu = (ctx) => {
    const rows = [['📝 Register / Update', '👤 My Profile'], ['📎 Upload Document', 'ℹ️ Help']];
    if (isAdmin(ctx)) rows.push(['📋 List Teachers', '📤 Export Excel']);
    return Markup.keyboard(rows).resize();
  };

  async function ask(ctx, step) {
    const text = PROMPTS[step];
    if (step === 'phone')
      return ctx.reply(text, Markup.keyboard([[Markup.button.contactRequest('📱 Share my number')]]).oneTime().resize());
    if (step === 'qualification')
      return ctx.reply(text, Markup.inlineKeyboard(QUALIFICATIONS.map((v) => [Markup.button.callback(v, `q:${v}`)])));
    if (step === 'shift')
      return ctx.reply(text, Markup.inlineKeyboard(SHIFTS.map((v) => [Markup.button.callback(v, `s:${v}`)])));
    return ctx.reply(text, Markup.removeKeyboard());
  }

  async function next(ctx, form) {
    const i = STEPS.indexOf(form.step);
    if (i < STEPS.length - 1) {
      form.step = STEPS[i + 1];
      return ask(ctx, form.step);
    }
    forms.delete(ctx.from.id);
    const { value, error } = validate(form.data);
    if (error) return ctx.reply('⚠️ ' + error + '\nPlease start again: /register', mainMenu(ctx));
    const existing = q.byTelegram(ctx.from.id);
    if (existing) q.update(existing.id, value);
    else q.create({ ...value, telegram_id: String(ctx.from.id) });
    return ctx.reply('✅ Saved! You can now upload your qualification documents.', mainMenu(ctx));
  }

  const profileText = (t) =>
    `👤 *${esc(t.name)}*\n📞 ${esc(t.phone)}\n🔧 Expertise: ${esc(t.expertise)}\n🎓 Qualification: ${esc(t.qualification)}\n` +
    `⏳ Experience: ${t.experience} years\n🕒 Shift: ${esc(t.shift)}`;
  const esc = (s) => String(s).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');

  const startRegister = (ctx) => {
    forms.set(ctx.from.id, { step: 'name', data: {} });
    return ask(ctx, 'name');
  };

  bot.start((ctx) =>
    ctx.reply(`Welcome to the Technical Teacher Management System, ${ctx.from.first_name}! 👋\nUse the menu below.`, mainMenu(ctx)));
  bot.help((ctx) =>
    ctx.reply('/register – add or update your data\n/me – view your profile\n/upload – send a qualification document\n' +
      (isAdmin(ctx) ? '/list – all teachers\n/search <word> – search\n/export – Excel file\n' : '')));

  bot.command('register', startRegister);
  bot.hears('📝 Register / Update', startRegister);
  bot.hears('ℹ️ Help', (ctx) => ctx.telegram.sendMessage(ctx.chat.id, 'Use /help'));

  const showMe = async (ctx) => {
    const t = q.byTelegram(ctx.from.id);
    if (!t) return ctx.reply('You are not registered yet. Tap 📝 Register / Update.');
    const docs = q.docs(t.id);
    return ctx.replyWithMarkdownV2(profileText(t) + `\n📎 Documents: ${docs.length}`);
  };
  bot.command('me', showMe);
  bot.hears('👤 My Profile', showMe);

  const uploadHint = (ctx) => {
    if (!q.byTelegram(ctx.from.id)) return ctx.reply('Please register first.');
    return ctx.reply('📎 Send your qualification document now as a *file* (PDF, JPG, PNG, DOC, DOCX – max 10 MB).', { parse_mode: 'Markdown' });
  };
  bot.command('upload', uploadHint);
  bot.hears('📎 Upload Document', uploadHint);

  // ---- Admin
  const list = (ctx, term) => {
    if (!isAdmin(ctx)) return ctx.reply('⛔ Admins only.');
    const rows = q.list(term).slice(0, 40);
    if (!rows.length) return ctx.reply('No teachers found.');
    return ctx.reply(rows.map((t, i) => `${i + 1}. ${t.name} | ${t.phone}\n    ${t.expertise} • ${t.qualification} • ${t.experience}y • ${t.shift}`).join('\n'));
  };
  bot.command('list', (ctx) => list(ctx, ''));
  bot.hears('📋 List Teachers', (ctx) => list(ctx, ''));
  bot.command('search', (ctx) => list(ctx, ctx.message.text.split(' ').slice(1).join(' ')));

  const exportXlsx = async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('⛔ Admins only.');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Teachers');
    ws.columns = ['Name', 'Phone', 'Expertise', 'Qualification', 'Experience', 'Shift'].map((h) => ({ header: h, key: h.toLowerCase(), width: 22 }));
    q.list('').forEach((t) => ws.addRow(t));
    ws.getRow(1).font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    return ctx.replyWithDocument({ source: Buffer.from(buf), filename: 'teachers.xlsx' });
  };
  bot.command('export', exportXlsx);
  bot.hears('📤 Export Excel', exportXlsx);

  // ---- Inline selections
  bot.action(/^q:(.+)$/, async (ctx) => {
    const f = forms.get(ctx.from.id);
    await ctx.answerCbQuery();
    if (!f || f.step !== 'qualification') return;
    f.data.qualification = ctx.match[1];
    await ctx.editMessageText('🎓 ' + ctx.match[1]);
    return next(ctx, f);
  });
  bot.action(/^s:(.+)$/, async (ctx) => {
    const f = forms.get(ctx.from.id);
    await ctx.answerCbQuery();
    if (!f || f.step !== 'shift') return;
    f.data.shift = ctx.match[1];
    await ctx.editMessageText('🕒 ' + ctx.match[1]);
    return next(ctx, f);
  });

  bot.on('contact', (ctx) => {
    const f = forms.get(ctx.from.id);
    if (!f || f.step !== 'phone') return;
    f.data.phone = ctx.message.contact.phone_number;
    return next(ctx, f);
  });

  // ---- File upload
  async function saveFile(ctx, fileId, originalName, size) {
    const teacher = q.byTelegram(ctx.from.id);
    if (!teacher) return ctx.reply('Please register first (📝 Register / Update).');
    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED.includes(ext)) return ctx.reply('⚠️ File type not allowed. Use PDF, JPG, PNG, DOC or DOCX.');
    if (size && size > MAX_FILE) return ctx.reply('⚠️ File is bigger than 10 MB.');
    const link = await ctx.telegram.getFileLink(fileId);
    const res = await fetch(link.href);
    if (!res.ok) return ctx.reply('⚠️ Download failed, please try again.');
    const stored = crypto.randomBytes(12).toString('hex') + ext;
    fs.writeFileSync(path.join(uploadDir, stored), Buffer.from(await res.arrayBuffer()));
    q.addDoc(teacher.id, originalName, stored);
    return ctx.reply(`✅ "${originalName}" uploaded.`);
  }
  bot.on('document', (ctx) => saveFile(ctx, ctx.message.document.file_id, ctx.message.document.file_name || 'document.pdf', ctx.message.document.file_size));
  bot.on('photo', (ctx) => {
    const p = ctx.message.photo[ctx.message.photo.length - 1];
    return saveFile(ctx, p.file_id, `photo_${Date.now()}.jpg`, p.file_size);
  });

  // ---- Text answers in the registration wizard
  bot.on('text', (ctx) => {
    const f = forms.get(ctx.from.id);
    if (!f) return ctx.reply('Use the menu below 👇', mainMenu(ctx));
    const text = ctx.message.text.trim();
    if (['qualification', 'shift'].includes(f.step)) return ctx.reply('Please tap one of the buttons above.');
    if (f.step === 'experience' && !/^\d{1,2}$/.test(text)) return ctx.reply('Please send a number, e.g. 5');
    f.data[f.step] = text;
    return next(ctx, f);
  });

  bot.catch((err, ctx) => {
    console.error('Bot error:', err);
    ctx.reply('Something went wrong. Please try again.').catch(() => {});
  });
  return bot;
}

module.exports = { createBot };
