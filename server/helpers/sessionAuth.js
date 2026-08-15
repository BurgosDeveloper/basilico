const crypto = require('crypto');

const sessions = new Map();

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { ...user, createdAt: Date.now() });
  return token;
}

function getSession(token) {
  return typeof token === 'string' ? sessions.get(token) || null : null;
}

function requireSession(req, res, next) {
  const user = getSession(req.get('x-basilico-session'));
  if (!user) return res.status(401).json({ error: 'Sesión no válida. Inicia sesión nuevamente.' });
  req.user = user;
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permiso para realizar esta acción.' });
    }
    return next();
  };
}

module.exports = { createSession, getSession, requireSession, requireRole };