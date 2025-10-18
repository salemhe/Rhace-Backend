import AuditLog from "../models/auditlog.model.js";

export const recordAuditLog = async (userId, action, entityType, entityId, details = {}) => {
  try {
    const auditLog = new AuditLog({
      user: userId,
      action,
      entityType,
      entityId,
      details,
    });
    await auditLog.save();
  } catch (error) {
    console.error("Error recording audit log:", error);
  }
};