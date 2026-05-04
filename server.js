import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '32kb' }));

const limiter = rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true });
app.use('/api/', limiter);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

app.post('/api/booking', async (req, res) => {
  const { name, email, company, topic, lang, website, _t } = req.body || {};
  console.log('[booking] ip=%s name=%s email=%s honeypot=%s', req.ip, name, email, !!website);
  if (website) return res.status(200).json({ ok: true }); // honeypot
  if (!_t || Date.now() - Number(_t) < 2000) return res.status(200).json({ ok: true }); // timing check
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.log('[booking] validation failed');
    return res.status(400).json({ ok: false, error: 'invalid' });
  }
  const subject = (lang === 'en'
    ? 'Intro call — request from '
    : 'Erstgespräch — Anfrage von ') + name;
  const text =
    `${lang === 'en' ? 'New intro-call request' : 'Neue Erstgespräch-Anfrage'}\n\n` +
    `Name: ${name}\nEmail: ${email}\n` +
    (company ? `Firma: ${company}\n` : '') +
    (topic ? `\n${topic}\n` : '');
  try {
    console.log('[booking] sending mail to', process.env.MAIL_TO);
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: process.env.MAIL_TO,
      replyTo: `${name} <${email}>`,
      subject,
      text,
    });
    console.log('[booking] mail sent ok');
    res.json({ ok: true });
  } catch (e) {
    console.error('[booking] mail send failed', e.message);
    res.status(500).json({ ok: false, error: 'send_failed' });
  }
});

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: '1h',
}));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log('agentic-reach web+api listening on', port));
