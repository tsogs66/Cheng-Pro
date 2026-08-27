/**
 * Cheng-Pro auth (phase 1).
 *
 * Open mode by default (authRequired: false) so LXC installs work immediately.
 * When authRequired is true, sessions are required for write routes.
 * Full Voyage Chief device-enrollment / fleet roles land in a later pass.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const store = require('./store');

const AUTH_DIR = () => path.join(store.DATA_DIR, 'auth');
const ACCOUNTS_PATH = () => path.join(AUTH_DIR(), 'accounts.json');
const SESSIONS_PATH = () => path.join(AUTH_DIR(), 'sessions.json');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PBKDF2_ROUNDS = 120000;

function ensureAuthFiles() {
  store.ensureDirs();
  fs.mkdirSync(AUTH_DIR(), { recursive: true });
  if (!fs.existsSync(ACCOUNTS_PATH())) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword('cheng-pro-admin', salt);
    writeJson(ACCOUNTS_PATH(), {
      accounts: [
        {
          username: 'admin',
          role: 'fleet_manager',
          passwordHash: hash,
          salt,
          vesselId: null,
          createdAt: store.now(),
        },
      ],
    });
  }
  if (!fs.existsSync(SESSIONS_PATH())) {
    writeJson(SESSIONS_PATH(), { sessions: [] });
  }
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(String(password), salt, PBKDF2_ROUNDS, 32, 'sha256').toString('hex');
}

function loadAccounts() {
  ensureAuthFiles();
  return readJson(ACCOUNTS_PATH(), { accounts: [] });
}

function loadSessions() {
  ensureAuthFiles();
  const data = readJson(SESSIONS_PATH(), { sessions: [] });
  const cutoff = Date.now();
  data.sessions = (data.sessions || []).filter((s) => new Date(s.expiresAt).getTime() > cutoff);
  return data;
}

function saveSessions(data) {
  writeJson(SESSIONS_PATH(), data);
}

function authRequired() {
  return !!store.getSettings().authRequired;
}

function createSession(account) {
  const sessions = loadSessions();
  const token = crypto.randomBytes(24).toString('hex');
  const session = {
    token,
    username: account.username,
    role: account.role,
    vesselId: account.vesselId || null,
    createdAt: store.now(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
  sessions.sessions.push(session);
  saveSessions(sessions);
  return session;
}

function getSession(token) {
  if (!token) return null;
  const sessions = loadSessions();
  const session = sessions.sessions.find((s) => s.token === token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) return null;
  return session;
}

function destroySession(token) {
  const sessions = loadSessions();
  sessions.sessions = sessions.sessions.filter((s) => s.token !== token);
  saveSessions(sessions);
}

function extractToken(req) {
  const header = req.headers['x-session-token'] || req.headers.authorization || '';
  if (typeof header !== 'string') return null;
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return header.trim() || null;
}

function login(username, password) {
  const { accounts } = loadAccounts();
  const account = accounts.find((a) => a.username === String(username || '').trim());
  if (!account) {
    const err = new Error('Invalid username or password');
    err.status = 401;
    throw err;
  }
  const hash = hashPassword(password, account.salt);
  if (hash !== account.passwordHash) {
    const err = new Error('Invalid username or password');
    err.status = 401;
    throw err;
  }
  return createSession(account);
}

function middleware(req, res, next) {
  const token = extractToken(req);
  req.session = getSession(token);
  req.authToken = token;

  if (!authRequired()) return next();

  // Always allow health + login
  if (req.path === '/api/health' || req.path === '/api/auth/login') return next();
  if (req.method === 'GET' && req.path.startsWith('/api/')) {
    // reads allowed with or without session in phase 1 when auth off; when on, require session
  }

  if (!req.session) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return next();
}

function requireSession(req, res, next) {
  if (!authRequired()) return next();
  if (!req.session) return res.status(401).json({ error: 'Authentication required' });
  return next();
}

module.exports = {
  ensureAuthFiles,
  authRequired,
  login,
  getSession,
  destroySession,
  extractToken,
  middleware,
  requireSession,
  createSession,
};
