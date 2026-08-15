async function getRatesForShift(client, shift) {
  const normalizedShift = shift === 'noche' ? 'noche' : shift === 'manana' ? 'manana' : 'ambos';
  const { rows } = await client.query(
    `SELECT cop_rate, bs_rate FROM shift_exchange_rates WHERE shift = $1`,
    [normalizedShift]
  );
  if (rows[0]) {
    return { COP: Number(rows[0].cop_rate) || 3950, Bs: Number(rows[0].bs_rate) || 36.5 };
  }

  const { rows: legacyRows } = await client.query(`SELECT cop_rate, bs_rate FROM exchange_rates WHERE id = 1`);
  return { COP: Number(legacyRows[0]?.cop_rate) || 3950, Bs: Number(legacyRows[0]?.bs_rate) || 36.5 };
}

module.exports = { getRatesForShift };