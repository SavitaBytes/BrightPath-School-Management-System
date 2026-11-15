async function writeAudit(tx, req, action, entity, entityId, details) {
  return tx.auditLog.create({
    data: {
      actorId: req.user.userId,
      action,
      entity,
      entityId,
      details: details ? JSON.stringify(details) : null
    }
  });
}

module.exports = { writeAudit };
