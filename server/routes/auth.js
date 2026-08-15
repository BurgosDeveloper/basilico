const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { createSession } = require('../helpers/sessionAuth');

const SHIFT_ACCOUNTS = {
  'mesero.manana': { username: 'Mesero Mañana', role: 'mesero', shift: 'manana' },
  'caja.manana': { username: 'Caja Mañana', role: 'caja', shift: 'manana' },
  'cocina.manana': { username: 'Cocina Mañana', role: 'cocina', shift: 'manana' },
  'admin.manana': { username: 'Admin Mañana', role: 'admin', shift: 'manana' },
  'mesero.noche': { username: 'Mesero Noche', role: 'mesero', shift: 'noche' },
  'caja.noche': { username: 'Caja Noche', role: 'caja', shift: 'noche' },
  'cocina.noche': { username: 'Cocina Noche', role: 'cocina', shift: 'noche' },
  'admin.noche': { username: 'Admin Noche', role: 'admin', shift: 'noche' },
};

function loginResponse(res, user) {
  const sessionToken = createSession(user);
  return res.json({ success: true, user: { ...user, sessionToken } });
}

module.exports = function(io) {
  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      const userClean = (username || '').trim().toLowerCase();
      const passClean = (password || '').trim().toLowerCase();

      if (userClean === 'basilico' || userClean === 'admin') {
        if (SHIFT_ACCOUNTS[passClean]) return loginResponse(res, SHIFT_ACCOUNTS[passClean]);
        if (passClean === 'basilico1.') return loginResponse(res, { username: 'Dueño', role: 'admin', shift: 'ambos' });
      }

      const { rows } = await query(`SELECT * FROM users WHERE LOWER(username) = $1 AND LOWER(password) = $2`, [userClean, passClean]);
      if (rows.length > 0) {
        const u = rows[0];
        return loginResponse(res, { username: u.name, role: u.role, shift: u.shift || 'ambos' });
      }

      return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error en servidor de autenticación' });
    }
  });

  return router;
};
