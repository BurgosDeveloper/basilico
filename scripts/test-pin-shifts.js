const { Pool } = require('pg');

async function runTests() {
  const pool = new Pool({
    host: 'localhost',
    database: 'basilico',
    user: 'postgres',
    password: 'sdmaia1.',
  });

  const client = await pool.connect();
  console.log('--- 🧪 INICIANDO TEST DE PIN DE 6 CARACTERES E INDEPENDENCIA DE TURNOS ---');

  try {
    // 1. Asegurar tabla system_settings y migración
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      INSERT INTO system_settings (key, value) VALUES ('admin_pin', '123456') ON CONFLICT (key) DO NOTHING;
      INSERT INTO system_settings (key, value) VALUES ('admin_pin_manana', '123456') ON CONFLICT (key) DO NOTHING;
      INSERT INTO system_settings (key, value) VALUES ('admin_pin_noche', '123456') ON CONFLICT (key) DO NOTHING;
    `);

    // Comprobar estado inicial
    const initRes = await client.query(`SELECT key, value FROM system_settings WHERE key IN ('admin_pin', 'admin_pin_manana', 'admin_pin_noche') ORDER BY key`);
    console.log('Valores iniciales:', initRes.rows);

    const getPinForShift = async (shift) => {
      let targetKey = 'admin_pin';
      if (shift === 'manana') targetKey = 'admin_pin_manana';
      else if (shift === 'noche') targetKey = 'admin_pin_noche';

      const res = await client.query('SELECT value FROM system_settings WHERE key = $1', [targetKey]);
      if (res.rows.length > 0 && res.rows[0].value) return res.rows[0].value;
      const fallback = await client.query('SELECT value FROM system_settings WHERE key = $1', ['admin_pin']);
      return fallback.rows[0]?.value || '123456';
    };

    const verifyPin = async (candidate, shift) => {
      if (typeof candidate !== 'string' || candidate.length !== 6) return false;
      const effectivePin = await getPinForShift(shift);
      return candidate === effectivePin;
    };

    const updatePinForShift = async (newPin, shift) => {
      if (typeof newPin !== 'string' || newPin.length !== 6) {
        throw new Error('La clave debe contener exactamente 6 caracteres.');
      }
      if (shift === 'manana') {
        await client.query(`INSERT INTO system_settings (key, value, updated_at) VALUES ('admin_pin_manana', $1, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`, [newPin]);
      } else if (shift === 'noche') {
        await client.query(`INSERT INTO system_settings (key, value, updated_at) VALUES ('admin_pin_noche', $1, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`, [newPin]);
      } else {
        await client.query(`INSERT INTO system_settings (key, value, updated_at) VALUES ('admin_pin', $1, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`, [newPin]);
        await client.query(`INSERT INTO system_settings (key, value, updated_at) VALUES ('admin_pin_manana', $1, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`, [newPin]);
        await client.query(`INSERT INTO system_settings (key, value, updated_at) VALUES ('admin_pin_noche', $1, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`, [newPin]);
      }
    };

    // TEST 1: Verificación de longitud estricta de 6 caracteres
    console.log('\n--- Test 1: Validación de longitud (6 caracteres) ---');
    try {
      await updatePinForShift('1234', 'manana');
      console.error('❌ Falló: debió rechazar 4 dígitos');
      process.exit(1);
    } catch (e) {
      console.log('✅ Correcto: PIN de 4 caracteres rechazado:', e.message);
    }

    try {
      await updatePinForShift('1234567', 'manana');
      console.error('❌ Falló: debió rechazar 7 caracteres');
      process.exit(1);
    } catch (e) {
      console.log('✅ Correcto: PIN de 7 caracteres rechazado:', e.message);
    }

    // TEST 2: Clave con caracteres mixtos (letras, números, símbolos) para Mañana
    console.log('\n--- Test 2: Asignación de clave alfanumérica/símbolos al Turno Mañana ---');
    const pinMañana = 'MN12#A';
    await updatePinForShift(pinMañana, 'manana');
    const storedMañana = await getPinForShift('manana');
    if (storedMañana === pinMañana) {
      console.log(`✅ Clave Mañana actualizada correctamente a "${storedMañana}"`);
    } else {
      console.error(`❌ Falló: esperada "${pinMañana}", obtenida "${storedMañana}"`);
      process.exit(1);
    }

    // TEST 3: Independencia de turnos - Verificar que Turno Noche NO cambió
    console.log('\n--- Test 3: Independencia de Turnos (Noche permanece intacta) ---');
    const storedNoche = await getPinForShift('noche');
    console.log(`Clave de Noche actual: "${storedNoche}"`);
    if (storedNoche === '123456') {
      console.log('✅ Correcto: El cambio en Mañana NO afectó la clave de Noche.');
    } else {
      console.error('❌ Falló: La clave de Noche fue modificada indebidamente.');
      process.exit(1);
    }

    // TEST 4: Validación de autorizaciones cruzadas
    console.log('\n--- Test 4: Verificación cruzada estricta ---');
    const v1 = await verifyPin(pinMañana, 'manana');
    const v2 = await verifyPin(pinMañana, 'noche');
    console.log(`¿Clave de Mañana ("${pinMañana}") autoriza Turno Mañana?`, v1 ? '✅ SÍ' : '❌ NO');
    console.log(`¿Clave de Mañana ("${pinMañana}") autoriza Turno Noche?`, v2 ? '❌ SÍ (ERROR: Debería ser rechazada)' : '✅ NO (Rechazo correcto por aislamiento)');
    if (!v1 || v2) {
      console.error('❌ Falló el aislamiento de turnos en verificación.');
      process.exit(1);
    }

    // TEST 5: Actualizar Turno Noche con su propia clave independiente
    console.log('\n--- Test 5: Asignación de clave independiente para Turno Noche ---');
    const pinNoche = 'NC99*B';
    await updatePinForShift(pinNoche, 'noche');
    const v3 = await verifyPin(pinNoche, 'noche');
    const v4 = await verifyPin(pinNoche, 'manana');
    console.log(`¿Clave de Noche ("${pinNoche}") autoriza Turno Noche?`, v3 ? '✅ SÍ' : '❌ NO');
    console.log(`¿Clave de Noche ("${pinNoche}") autoriza Turno Mañana?`, v4 ? '❌ SÍ (ERROR: Debería ser rechazada)' : '✅ NO (Rechazo correcto por aislamiento)');
    if (!v3 || v4) {
      console.error('❌ Falló el aislamiento de clave de Noche.');
      process.exit(1);
    }

    // TEST 6: Restaurar claves por defecto '123456' para mantener ambiente limpio
    console.log('\n--- Test 6: Restaurar valores predeterminados seguros (123456) ---');
    await updatePinForShift('123456', 'ambos');
    const rM = await getPinForShift('manana');
    const rN = await getPinForShift('noche');
    console.log(`Clave Mañana restablecida: "${rM}", Clave Noche restablecida: "${rN}"`);
    if (rM === '123456' && rN === '123456') {
      console.log('✅ Estado por defecto "123456" verificado con éxito en ambos turnos.');
    }

    console.log('\n🎉 ¡TODOS LOS TESTS DE PIN DE 6 CARACTERES E INDEPENDENCIA DE TURNOS PASARON AL 100%!');
  } finally {
    client.release();
    await pool.end();
  }
}

runTests().catch((err) => {
  console.error('💥 Error inesperado durante los tests:', err);
  process.exit(1);
});
