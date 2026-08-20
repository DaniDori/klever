/* Клевер — вход в админ-панель.

   Пароль в базе не хранится: лежит только scrypt-хеш с солью. Даже если файл
   базы утечёт, пароль из него не достать. Сессия — httpOnly-кука, из
   JavaScript её не прочитать, поэтому украсть её через чужой скрипт нельзя. */

'use strict';

var crypto = require('node:crypto');
var db = require('./db');

var COOKIE = 'klever_sid';
var SESSION_DAYS = 14;

/* ---------- Хеширование пароля ---------- */

function hash(password) {
  var salt = crypto.randomBytes(16);
  var key = crypto.scryptSync(String(password), salt, 32);
  return 'scrypt$' + salt.toString('hex') + '$' + key.toString('hex');
}

function verify(password, stored) {
  if (!stored) return false;
  var parts = String(stored).split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    var salt = Buffer.from(parts[1], 'hex');
    var expected = Buffer.from(parts[2], 'hex');
    var actual = crypto.scryptSync(String(password), salt, expected.length);
    return crypto.timingSafeEqual(expected, actual);
  } catch (e) {
    return false;
  }
}

function setPassword(password) {
  db.setSetting('adminPasswordHash', hash(password));
}

function hasPassword() {
  return !!db.settings(true).adminPasswordHash;
}

/* Пароль совпадает с демонстрационным — админке есть о чём предупредить */
function isDefaultPassword() {
  return verify('klever', db.settings(true).adminPasswordHash);
}

/* ---------- Защита от перебора ---------- */

var attempts = new Map();
var MAX_ATTEMPTS = 10;
var WINDOW_MS = 15 * 60 * 1000;

function tooManyAttempts(ip) {
  var rec = attempts.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > WINDOW_MS) { attempts.delete(ip); return false; }
  return rec.count >= MAX_ATTEMPTS;
}

function noteFailure(ip) {
  var rec = attempts.get(ip);
  if (!rec || Date.now() - rec.first > WINDOW_MS) {
    attempts.set(ip, { first: Date.now(), count: 1 });
  } else {
    rec.count += 1;
  }
}

function clearAttempts(ip) { attempts.delete(ip); }

function minutesLeft(ip) {
  var rec = attempts.get(ip);
  if (!rec) return 0;
  return Math.max(1, Math.ceil((WINDOW_MS - (Date.now() - rec.first)) / 60000));
}

/* ---------- Куки ---------- */

function readCookies(req) {
  var out = {};
  var raw = req.headers.cookie;
  if (!raw) return out;
  raw.split(';').forEach(function (part) {
    var i = part.indexOf('=');
    if (i < 0) return;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function isSecure(req) {
  if (process.env.SECURE_COOKIES === '0') return false;
  if (process.env.SECURE_COOKIES === '1') return true;
  var proto = req.headers['x-forwarded-proto'];
  return String(proto || '').split(',')[0].trim() === 'https';
}

function sessionCookie(req, id, maxAgeSeconds) {
  var bits = [
    COOKIE + '=' + id,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + maxAgeSeconds
  ];
  if (isSecure(req)) bits.push('Secure');
  return bits.join('; ');
}

function login(req, password) {
  var stored = db.settings(true).adminPasswordHash;
  if (!verify(password, stored)) return null;
  var s = db.createSession(SESSION_DAYS);
  return { cookie: sessionCookie(req, s.id, SESSION_DAYS * 86400) };
}

function logout(req) {
  var id = readCookies(req)[COOKIE];
  db.deleteSession(id);
  return { cookie: sessionCookie(req, '', 0) };
}

function isAdmin(req) {
  return db.checkSession(readCookies(req)[COOKIE]);
}

module.exports = {
  COOKIE: COOKIE,
  hash: hash, verify: verify, setPassword: setPassword,
  hasPassword: hasPassword, isDefaultPassword: isDefaultPassword,
  tooManyAttempts: tooManyAttempts, noteFailure: noteFailure,
  clearAttempts: clearAttempts, minutesLeft: minutesLeft,
  readCookies: readCookies, sessionCookie: sessionCookie,
  login: login, logout: logout, isAdmin: isAdmin
};
