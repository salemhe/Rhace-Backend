import { Schema, model } from "mongoose";

const KYCSchema = new Schema(
  {
    vendor: {
      type: Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    documentType: {
      type: String,
      enum: ["passport", "drivers_license", "national_id", "business_registration"],
      required: true,
    },
    documentNumber: {
      type: String,
      required: true,
    },
    documentUrl: {
      type: String,
      required: true,
    },
    expiryDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    rejectionReason: {
      type: String,
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
    },
    verifiedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

export default model("KYC", KYCSchema);
