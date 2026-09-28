function canAccessShift(user, recordShift) {
  const userShift = typeof user === 'string' ? user : user?.shift;
  if (!userShift || userShift === 'ambos') return true;
  if (!recordShift || recordShift === 'ambos') return true;
  return userShift === recordShift;
}

function assertShiftAccess(user, recordShift) {
  if (!canAccessShift(user, recordShift)) {
    const userShift = typeof user === 'string' ? user : user?.shift;
    const error = new Error(`Acceso denegado: El registro pertenece al turno ${recordShift} y tu sesión es de turno ${userShift}.`);
    error.statusCode = 403;
    error.status = 403;
    throw error;
  }
  return true;
}

function shiftFilter(user, column = 'shift', parameterIndex = 1) {
  const userShift = typeof user === 'string' ? user : user?.shift;
  if (!userShift || userShift === 'ambos') {
    return { clause: '', params: [] };
  }
  return { clause: ` AND ${column} = $${parameterIndex}`, params: [userShift] };
}

module.exports = { canAccessShift, assertShiftAccess, shiftFilter };