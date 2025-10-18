import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  action: { type: String, required: true }, // e.g., "CREATE_HOTEL", "UPDATE_BOOKING_STATUS"
  entityType: { type: String, required: true }, // e.g., "Hotel", "Booking"
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  details: { type: Object }, // Additional details about the action
}, { timestamps: true });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
