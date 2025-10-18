import { Schema, model } from "mongoose";

const ReportJobSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["vendor_earnings", "reservations", "payments", "users", "vendors"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    parameters: {
      type: Schema.Types.Mixed, // Flexible object for report parameters
    },
    fileUrl: {
      type: String,
    },
    fileName: {
      type: String,
    },
    fileSize: {
      type: Number,
    },
    format: {
      type: String,
      enum: ["csv", "xlsx", "pdf"],
      default: "csv",
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
    },
    completedAt: {
      type: Date,
    },
    errorMessage: {
      type: String,
    },
    downloadCount: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  },
  { timestamps: true }
);

// Index for cleanup
ReportJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default model("ReportJob", ReportJobSchema);
