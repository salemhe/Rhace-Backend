import AuditLog from "../models/auditlog.model.js";

/**
 * Records an audit log entry
 * @param {String|null} userId - The ID of the user performing the action (null for system actions)
 * @param {String} action - The action being performed
 * @param {String} entityType - The type of entity being affected
 * @param {String|null} entityId - The ID of the entity being affected
 * @param {Object} details - Additional details about the action
 * @param {Object} metadata - Optional metadata (ipAddress, userAgent)
 */
export const recordAuditLog = async (
  userId, 
  action, 
  entityType, 
  entityId, 
  details = {},
  metadata = {}
) => {
  try {
    const auditLog = new AuditLog({
      user: userId || null, // ✅ Allow null for system actions
      action,
      entityType,
      entityId,
      details: {
        ...details,
        initiatedBy: userId ? 'user' : 'system', // ✅ Track if it was user or system action
        timestamp: new Date().toISOString(),
      },
      ipAddress: metadata.ipAddress || (userId ? null : 'system'),
      userAgent: metadata.userAgent || (userId ? null : 'system-scheduled-job'),
    });
    
    await auditLog.save();
    
    // Log to console for system actions (optional)
    if (!userId) {
      console.log(`📋 System Audit Log: ${action} on ${entityType} ${entityId || '(no ID)'}`);
    }
  } catch (error) {
    console.error("Error recording audit log:", error);
  }
};

/**
 * Helper function specifically for system actions
 * @param {String} action - The action being performed
 * @param {String} entityType - The type of entity being affected
 * @param {String|null} entityId - The ID of the entity being affected
 * @param {Object} details - Additional details about the action
 */
export const recordSystemAuditLog = async (action, entityType, entityId, details = {}) => {
  return recordAuditLog(null, action, entityType, entityId, details);
};