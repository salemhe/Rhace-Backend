import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // ✅ Changed from true to false to allow system actions
      default: null
    },
    action: {
      type: String,
      required: true,
      enum: [
        // User actions
        'create',
        'update',
        'delete',
        'login',
        'logout',
        'password_change',
        'password_reset',
        'email_verification',
        'profile_update',
        
        // Booking actions
        'booking_created',
        'booking_updated',
        'booking_cancelled',
        'booking_confirmed',
        
        // Payment actions
        'payment_processed',
        'payment_failed',
        'payment_refunded',
        
        // Vendor actions
        'vendor_approved',
        'vendor_rejected',
        'vendor_suspended',
        'vendor_activated',
        
        // System actions
        'balance_reconciliation',
        'system_action',
        'BALANCE_DISCREPANCY_DETECTED',
        
        // Hotel actions
        'CREATE_HOTEL',
        'UPDATE_HOTEL',
        'DELETE_HOTEL',
        
        // Booking status actions
        'UPDATE_BOOKING_STATUS',
      ]
    },
    entityType: {
      type: String,
      required: true,
      enum: [
        'User',
        'Vendor',
        'Hotel',
        'Booking',
        'Payment',
        'PaymentTransaction',
        'Payout',
        'RoomType',
        'MenuItem',
        'Review',
        'Transaction',
        'System',
      ]
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false, // Some system actions might not have a specific entity
      default: null
    },
    details: {
      type: mongoose.Schema.Types.Mixed, // More flexible than Object
      default: {}
    },
    ipAddress: {
      type: String,
      default: null
    },
    userAgent: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Indexes for faster queries
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 }); // For time-based queries

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;