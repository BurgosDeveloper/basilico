function canAccessShift(user, recordShift) {
  return user?.shift === 'ambos' || user?.shift === recordShift;
}

function assertShiftAccess(user, recordShift) {
  if (!canAccessShift(user, recordShift)) {
    const error = new Error('La comanda pertenece al otro turno.');
    error.statusCode = 403;
    throw error;
  }
}

function shiftFilter(user, column = 'shift', parameterIndex = 1) {
  if (user?.shift === 'ambos') return { clause: '', params: [] };
  return { clause: ` WHERE ${column} = $${parameterIndex}`, params: [user?.shift] };
}

module.exports = { canAccessShift, assertShiftAccess, shiftFilter };