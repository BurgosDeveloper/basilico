const assert = require('assert');
const { initDb } = require('../server/db');
const authRouter = require('../server/routes/auth');
const express = require('express');

async function testAllCredentials() {
  console.log('========================================================================');
  console.log('🔐 AUDITORÍA INTEGRAL DE CREDENCIALES Y AUTENTICACIÓN POR TURNO');
  console.log('========================================================================\n');

  await initDb();

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter(null));

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/auth`;

  const testLogin = async (username, password) => {
    const res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const body = await res.json();
    return { status: res.status, body };
  };

  const accountsToTest = [
    // ☀️ TURNO MAÑANA
    { user: 'admin.manana', pass: 'admin123', expRole: 'admin', expShift: 'manana', desc: 'Admin Mañana (clave canónica)' },
    { user: 'caja.manana', pass: 'caja123', expRole: 'caja', expShift: 'manana', desc: 'Caja Mañana (clave canónica)' },
    { user: 'mesero.manana', pass: 'mesero123', expRole: 'mesero', expShift: 'manana', desc: 'Mesero Mañana (clave canónica)' },
    { user: 'cocina.manana', pass: 'cocina123', expRole: 'cocina', expShift: 'manana', desc: 'Cocina Mañana (clave canónica)' },

    // ☀️ Turno Mañana con separador guión bajo (caja_manana) y clave por rol
    { user: 'caja_manana', pass: 'caja', expRole: 'caja', expShift: 'manana', desc: 'Caja Mañana con guión bajo (caja_manana / caja)' },
    { user: 'mesero_manana', pass: 'mesero', expRole: 'mesero', expShift: 'manana', desc: 'Mesero Mañana con guión bajo (mesero_manana / mesero)' },

    // 🌙 TURNO NOCHE
    { user: 'admin.noche', pass: 'admin123', expRole: 'admin', expShift: 'noche', desc: 'Admin Noche (clave canónica)' },
    { user: 'caja.noche', pass: 'caja123', expRole: 'caja', expShift: 'noche', desc: 'Caja Noche (clave canónica)' },
    { user: 'mesero.noche', pass: 'mesero123', expRole: 'mesero', expShift: 'noche', desc: 'Mesero Noche (clave canónica)' },
    { user: 'cocina.noche', pass: 'cocina123', expRole: 'cocina', expShift: 'noche', desc: 'Cocina Noche (clave canónica)' },

    // 🌙 Cuentas legacy nocturnas
    { user: 'carlos', pass: 'carloscrispys', expRole: 'admin', expShift: 'noche', desc: 'Carlos (Admin Noche Legacy)' },
    { user: 'cajeroa', pass: 'cajero', expRole: 'caja', expShift: 'noche', desc: 'Cajeroa (Caja Noche Legacy)' },
    { user: 'mesero', pass: 'mesero', expRole: 'mesero', expShift: 'noche', desc: 'Mesero (Mesero Noche Legacy)' },
    { user: 'cocina', pass: 'cocina', expRole: 'cocina', expShift: 'noche', desc: 'Cocina (Cocina Noche Legacy)' },

    // 👑 DUEÑO / ADMIN GENERAL
    { user: 'admin', pass: 'basilico1.', expRole: 'admin', expShift: 'ambos', desc: 'Administrador General (basilico1.)' },
    { user: 'basilico', pass: 'basilico1.', expRole: 'admin', expShift: 'ambos', desc: 'Dueño Basilico (basilico1.)' },
  ];

  console.log('1️⃣ Validando Login de Cuentas Oficiales y Turnos...');
  for (const item of accountsToTest) {
    const res = await testLogin(item.user, item.pass);
    assert.strictEqual(res.status, 200, `Login falló para ${item.desc}: status ${res.status}`);
    assert.strictEqual(res.body.success, true, `Success debe ser true para ${item.desc}`);
    assert.strictEqual(res.body.user.role, item.expRole, `Rol debe ser ${item.expRole} para ${item.desc}`);
    assert.strictEqual(res.body.user.shift, item.expShift, `Turno debe ser ${item.expShift} para ${item.desc}`);
    assert(Boolean(res.body.user.sessionToken), `Debe retornar sessionToken para ${item.desc}`);
    console.log(`  ✅ [OK] ${item.desc} -> Rol: ${res.body.user.role} | Turno: ${res.body.user.shift}`);
  }

  console.log('\n2️⃣ Validando Rechazo de Credenciales Inválidas...');
  const badLogins = [
    { user: 'admin.manana', pass: 'clave_incorrecta_999' },
    { user: 'caja.noche', pass: 'wrongpass' },
    { user: 'usuario_inexistente', pass: '1234' },
  ];

  for (const bad of badLogins) {
    const res = await testLogin(bad.user, bad.pass);
    assert.strictEqual(res.status, 401, `Debe retornar 401 para credenciales inválidas (${bad.user})`);
    assert.strictEqual(res.body.success, false, `Debe retornar success: false`);
    console.log(`  ✅ [OK] Rechazo exitoso con 401 para ${bad.user}`);
  }

  console.log('\n========================================================================');
  console.log('🎉 TODAS LAS CREDENCIALES Y LOGINS VALIDADOS CON ÉXITO');
  console.log('========================================================================\n');
  server.close();
  process.exit(0);
}

testAllCredentials().catch((e) => {
  console.error('❌ Error en prueba de credenciales:', e);
  process.exit(1);
});
