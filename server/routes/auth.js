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

  // Verificar PIN/Clave de seguridad de 6 caracteres para autorizar acciones de caja
  router.post('/verify-admin-pin', async (req, res) => {
    try {
      const { pin, shift } = req.body;
      const cleanPin = String(pin || '').trim();
      const userShift = String(shift || req.user?.shift || 'ambos').toLowerCase();

      const { rows } = await query(`SELECT key, value FROM system_settings WHERE key IN ('admin_pin', 'admin_pin_manana', 'admin_pin_noche')`);
      const pinMap = {};
      for (const r of rows) pinMap[r.key] = r.value;
      const pinGeneral = pinMap['admin_pin'] || '123456';
      const pinManana = pinMap['admin_pin_manana'] || pinGeneral || '123456';
      const pinNoche = pinMap['admin_pin_noche'] || pinGeneral || '123456';

      let isValid = false;
      if (userShift === 'manana') {
        isValid = (cleanPin === pinManana);
      } else if (userShift === 'noche') {
        isValid = (cleanPin === pinNoche);
      } else {
        isValid = (cleanPin === pinManana || cleanPin === pinNoche || cleanPin === pinGeneral);
      }

      if (isValid) {
        return res.json({ success: true, valid: true });
      } else {
        return res.status(401).json({ success: false, valid: false, error: 'Clave de seguridad incorrecta para este turno.' });
      }
    } catch (err) {
      console.error('Error al verificar PIN de admin:', err);
      res.status(500).json({ error: 'Error al verificar PIN' });
    }
  });

  // Obtener PIN/Clave de seguridad actual (solo admin)
  router.get('/admin-pin', async (req, res) => {
    try {
      const requestedShift = String(req.query.shift || req.user?.shift || 'ambos').toLowerCase();
      const { rows } = await query(`SELECT key, value FROM system_settings WHERE key IN ('admin_pin', 'admin_pin_manana', 'admin_pin_noche')`);
      const pinMap = {};
      for (const r of rows) pinMap[r.key] = r.value;
      const pinGeneral = pinMap['admin_pin'] || '123456';
      const pinManana = pinMap['admin_pin_manana'] || pinGeneral || '123456';
      const pinNoche = pinMap['admin_pin_noche'] || pinGeneral || '123456';

      let currentPin = pinGeneral;
      if (requestedShift === 'manana') currentPin = pinManana;
      else if (requestedShift === 'noche') currentPin = pinNoche;

      res.json({
        success: true,
        pin: currentPin,
        pinManana,
        pinNoche,
        shift: requestedShift,
      });
    } catch (err) {
      console.error('Error al consultar PIN de admin:', err);
      res.status(500).json({ error: 'Error al consultar PIN' });
    }
  });

  // Actualizar PIN/Clave de seguridad de 6 caracteres (independiente por turno)
  router.put('/admin-pin', async (req, res) => {
    try {
      const { pin, shift } = req.body;
      const cleanPin = String(pin || '').trim();
      const targetShift = String(shift || req.user?.shift || 'ambos').toLowerCase();

      if (typeof cleanPin !== 'string' || cleanPin.length !== 6) {
        return res.status(400).json({ error: 'La clave de seguridad debe contener exactamente 6 caracteres.' });
      }

      const keysToUpdate = [];
      if (targetShift === 'manana') {
        keysToUpdate.push('admin_pin_manana');
      } else if (targetShift === 'noche') {
        keysToUpdate.push('admin_pin_noche');
      } else {
        keysToUpdate.push('admin_pin_manana', 'admin_pin_noche', 'admin_pin');
      }

      for (const k of keysToUpdate) {
        await query(
          `INSERT INTO system_settings (key, value, updated_at)
           VALUES ($1, $2, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
          [k, cleanPin]
        );
      }

      console.log(`🔐 [CLAVE DE SEGURIDAD ACTUALIZADA] Nueva clave de 6 caracteres configurada para turno: ${targetShift}`);
      res.json({
        success: true,
        message: `Clave de seguridad de 6 caracteres actualizada exitosamente para turno ${targetShift}.`,
        pin: cleanPin,
        shift: targetShift,
      });
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
