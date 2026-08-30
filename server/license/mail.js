/**
 * License key email delivery.
 *
 * Configure one of:
 *   SMTP_HOST + SMTP_PORT + SMTP_USER + SMTP_PASS + LICENSE_MAIL_FROM
 *   LICENSE_MAIL_WEBHOOK_URL (+ optional LICENSE_MAIL_WEBHOOK_TOKEN)
 *
 * Without either, messages are written to data/license-mail-outbox.jsonl
 * so ops can still recover keys in air-gapped / misconfigured hosts.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function dataRoot() {
  return process.env.CHENG_PRO_DATA_DIR
    || process.env.TMS_DATA_DIR
    || path.join(__dirname, '..', '..', 'data');
}

function fromAddress() {
  return process.env.LICENSE_MAIL_FROM
    || process.env.SMTP_FROM
    || 'licenses@localhost';
}

function productLabel(sku) {
  if (sku === 'voyage-chief') return 'Voyage Chief';
  if (sku === 'tank-chief') return 'Tank Chief';
  return 'ChEng AIO';
}

function buildMessage(issued) {
  const product = productLabel(issued.sku);
  const subject = `${product} license key`;
  const expires = issued.expiresAt
    ? `Expires: ${String(issued.expiresAt).slice(0, 10)} (yearly)`
    : 'Plan: lifetime (still requires online check every 60 days)';
  const text = [
    `Thank you for purchasing ${product}.`,
    '',
    `License key: ${issued.key}`,
    `Email bound to this license: ${issued.email}`,
    `SKU: ${issued.sku}`,
    `Plan: ${issued.plan}`,
    expires,
    '',
    'Activation:',
    '1. Open the app → License',
    '2. Enter this email and license key',
    '3. Activate (1 Android seat + 1 Windows seat per license)',
    '',
    'Keep this email. Support can re-send the key if you lose it.',
    '',
    '— ts0gs · Marvin C. Endozo',
  ].join('\n');
  return { subject, text, from: fromAddress(), to: issued.email };
}

async function writeOutbox(msg, meta) {
  const p = path.join(dataRoot(), 'license-mail-outbox.jsonl');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify({
    at: new Date().toISOString(),
    ...meta,
    ...msg,
  }) + '\n');
}

async function sendViaWebhook(msg) {
  const url = process.env.LICENSE_MAIL_WEBHOOK_URL;
  if (!url) return false;
  const headers = { 'Content-Type': 'application/json' };
  const token = process.env.LICENSE_MAIL_WEBHOOK_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      from: msg.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Mail webhook ${res.status}: ${body.slice(0, 200)}`);
  }
  return true;
}

async function sendViaSmtp(msg) {
  const host = process.env.SMTP_HOST || process.env.LICENSE_SMTP_HOST;
  if (!host) return false;
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    throw new Error('nodemailer not installed — npm install nodemailer');
  }
  const port = Number(process.env.SMTP_PORT || process.env.LICENSE_SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: (process.env.SMTP_USER || process.env.LICENSE_SMTP_USER)
      ? {
          user: process.env.SMTP_USER || process.env.LICENSE_SMTP_USER,
          pass: process.env.SMTP_PASS || process.env.LICENSE_SMTP_PASS,
        }
      : undefined,
  });
  await transporter.sendMail({
    from: msg.from,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
  });
  return true;
}

/**
 * Deliver a newly issued (or re-sent) license key.
 * Always appends to the outbox; also tries webhook then SMTP.
 */
async function deliverLicenseEmail(issued) {
  const msg = buildMessage(issued);
  let channel = 'outbox';
  let error = null;
  try {
    if (await sendViaWebhook(msg)) channel = 'webhook';
    else if (await sendViaSmtp(msg)) channel = 'smtp';
  } catch (e) {
    error = e.message || String(e);
  }
  await writeOutbox(msg, {
    licenseId: issued.id,
    key: issued.key,
    channel,
    error,
  });
  if (error && channel === 'outbox') {
    const err = new Error(error);
    err.status = 502;
    throw err;
  }
  return { ok: true, channel, to: msg.to };
}

function mailConfigured() {
  return !!(
    process.env.LICENSE_MAIL_WEBHOOK_URL
    || process.env.SMTP_HOST
    || process.env.LICENSE_SMTP_HOST
  );
}

module.exports = {
  deliverLicenseEmail,
  buildMessage,
  mailConfigured,
  productLabel,
};
