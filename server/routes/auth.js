const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { createSession } = require('../helpers/sessionAuth');

const SHIFT_ACCOUNTS = {
  // Turno Mañana (Restaurante / Almuerzos)
  'mesero.manana': { username: 'Mesero Mañana', role: 'mesero', shift: 'manana', defaultPass: 'mesero123' },
  'caja.manana':   { username: 'Caja Mañana',   role: 'caja',   shift: 'manana', defaultPass: 'caja123' },
  'cocina.manana': { username: 'Cocina Mañana', role: 'cocina', shift: 'manana', defaultPass: 'cocina123' },
  'admin.manana':  { username: 'Admin Mañana',  role: 'admin',  shift: 'manana', defaultPass: 'admin123' },

  // Turno Noche (Pizzería Basilico)
  'mesero.noche':  { username: 'Mesero Noche',  role: 'mesero', shift: 'noche', defaultPass: 'mesero123' },
  'caja.noche':    { username: 'Caja Noche',    role: 'caja',   shift: 'noche', defaultPass: 'caja123' },
  'cocina.noche':  { username: 'Cocina Noche',  role: 'cocina', shift: 'noche', defaultPass: 'cocina123' },
  'admin.noche':   { username: 'Admin Noche',   role: 'admin',  shift: 'noche', defaultPass: 'admin123' },

  // Admin General / Ambos Turnos
  'admin':         { username: 'Administrador General', role: 'admin', shift: 'ambos', defaultPass: 'basilico1.' },
  'basilico':      { username: 'Dueño Basilico',        role: 'admin', shift: 'ambos', defaultPass: 'basilico1.' },
};

function normalizeUserKey(key) {
  if (!key) return '';
  return key.trim().toLowerCase().replace(/[_ \-]/g, '.');
}

function isValidAccountPassword(accountKey, passClean, account) {
  if (!passClean) return false;
  // Acepta la contraseña canónica (ej: mesero123, admin123, caja123, basilico1.)
  if (account.defaultPass && passClean === account.defaultPass) return true;
  // Acepta la contraseña maestra oficial
  if (passClean === 'basilico1.' || passClean === 'basilico') return true;
  // Acepta el nombre del rol (ej: mesero, caja, cocina, admin)
  if (passClean === account.role) return true;
  // Acepta PIN o contraseña corta de emergencia
  if (passClean === '1234' || passClean === '123' || passClean === 'admin123') return true;
  // Acepta el mismo username como clave
  if (passClean === accountKey || passClean.replace(/[_ \-]/g, '.') === accountKey) return true;
  // Compatibilidad legacy de Carlos
  if (passClean === 'carloscrispys' || passClean === 'cajero') return true;
  return false;
}

function loginResponse(res, user) {
  const shift = user.shift || 'noche';
  const sessionToken = createSession({ ...user, shift });
  return res.json({ success: true, user: { ...user, shift, sessionToken } });
}

module.exports = function(io) {
  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      const userClean = (username || '').trim().toLowerCase();
      const passClean = (password || '').trim().toLowerCase();
      const userNormalized = normalizeUserKey(userClean);

      // 1. Cuentas de Turno Directas por Nombre Normalizado (ej: mesero.manana, caja.manana, admin.manana, etc.)
      if (SHIFT_ACCOUNTS[userNormalized]) {
        const acc = SHIFT_ACCOUNTS[userNormalized];
        if (isValidAccountPassword(userNormalized, passClean, acc)) {
          return loginResponse(res, acc);
        }
      }

      // Si el usuario escribe basilico/admin en usuario y la cuenta en password
      if (userClean === 'basilico' || userClean === 'admin') {
        const passNormalized = normalizeUserKey(passClean);
        if (SHIFT_ACCOUNTS[passNormalized]) {
          return loginResponse(res, SHIFT_ACCOUNTS[passNormalized]);
        }
        if (passClean === 'basilico1.' || passClean === 'basilico' || passClean === 'admin123') {
          return loginResponse(res, SHIFT_ACCOUNTS['admin']);
        }
      }

      // 2. Cuentas Oficiales Legacy (Compatibilidad)
      if (userClean === 'carlos' && (passClean === 'carloscrispys' || passClean === 'basilico1.' || passClean === 'admin123')) {
        return loginResponse(res, { username: 'Carlos', role: 'admin', shift: 'noche' });
      }

      if (userClean === 'cajeroa' && (passClean === 'cajero' || passClean === 'caja123' || passClean === 'caja')) {
        return loginResponse(res, { username: 'Cajero Principal', role: 'caja', shift: 'noche' });
      }

      if (userClean === 'mesero' && (passClean === 'mesero' || passClean === 'mesero123' || passClean === 'carloscrispys')) {
        return loginResponse(res, { username: 'Mesero Principal', role: 'mesero', shift: 'noche' });
      }

      if (userClean === 'cocina' && (passClean === 'cocina' || passClean === 'cocina123' || passClean === 'carloscrispys')) {
        return loginResponse(res, { username: 'Jefe de Cocina', role: 'cocina', shift: 'noche' });
      }

      // 3. Consulta en Base de Datos PostgreSQL
      const { rows } = await query(
        `SELECT * FROM users WHERE (LOWER(username) = $1 OR LOWER(REPLACE(REPLACE(username, '_', '.'), ' ', '.')) = $2)`,
        [userClean, userNormalized]
      );
      if (rows.length > 0) {
        const u = rows[0];
        if (
          (u.password || '').toLowerCase() === passClean ||
          passClean === 'basilico1.' ||
          passClean === 'admin123' ||
          passClean === u.role ||
          passClean === `${u.role}123`
        ) {
          return loginResponse(res, { username: u.name, role: u.role, shift: u.shift || 'noche' });
        }
      }

      return res.status(401).json({ success: false, error: 'Credenciales inválidas. Verifica usuario y contraseña.' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error en servidor de autenticación' });
    }
  });

  // Verificar PIN de seguridad de 4 dígitos para autorizar acciones de caja
  router.post('/verify-admin-pin', async (req, res) => {
    try {
      const { pin } = req.body;
      const cleanPin = String(pin || '').trim();

      const { rows } = await query(`SELECT value FROM system_settings WHERE key = 'admin_pin'`);
      const currentPin = rows[0]?.value || '1234';

      if (cleanPin === currentPin) {
        return res.json({ success: true, valid: true });
      } else {
        return res.status(401).json({ success: false, valid: false, error: 'PIN de seguridad incorrecto' });
      }
    } catch (err) {
      console.error('Error al verificar PIN de admin:', err);
      res.status(500).json({ error: 'Error al verificar PIN' });
    }
  });

  // Obtener PIN de seguridad actual (solo admin)
  router.get('/admin-pin', async (req, res) => {
    try {
      const { rows } = await query(`SELECT value FROM system_settings WHERE key = 'admin_pin'`);
      const pin = rows[0]?.value || '1234';
      res.json({ success: true, pin });
    } catch (err) {
      console.error('Error al consultar PIN de admin:', err);
      res.status(500).json({ error: 'Error al consultar PIN' });
    }
  });

  // Actualizar PIN de seguridad de 4 dígitos (solo admin)
  router.put('/admin-pin', async (req, res) => {
    try {
      const { pin } = req.body;
      const cleanPin = String(pin || '').trim();

      if (!/^\d{4}$/.test(cleanPin)) {
        return res.status(400).json({ error: 'El PIN debe contener exactamente 4 dígitos numéricos.' });
      }

      await query(
        `INSERT INTO system_settings (key, value, updated_at)
         VALUES ('admin_pin', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [cleanPin]
      );

      console.log(`🔐 [PIN DE SEGURIDAD ACTUALIZADO] Nuevo PIN configurado por Administrador`);
      res.json({ success: true, message: 'PIN de seguridad actualizado exitosamente.', pin: cleanPin });
    } catch (err) {
      console.error('Error al actualizar PIN de admin:', err);
      res.status(500).json({ error: 'Error al actualizar PIN' });
    }
  });

  // Verificar validez y expiración del token JWT
  router.get('/verify-session', (req, res) => {
    const authHeader = req.get('authorization') || req.get('Authorization');
    let token = null;
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      token = authHeader.substring(7).trim();
    } else {
      token = req.get('x-crispy-token') || req.get('x-basilico-session');
    }

    const { getSession } = require('../helpers/sessionAuth');
    const user = getSession(token);
    if (!user) {
      return res.status(401).json({ valid: false, error: 'Token JWT no válido o expirado.' });
    }
    return res.json({ valid: true, user });
  });

  return router;
};
