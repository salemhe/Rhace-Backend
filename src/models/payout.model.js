import { Schema, model } from "mongoose";

const PayoutSchema = new Schema(
  {
    vendor: {
      type: Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    reference: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple documents to have a null reference, but unique if not null
    },
    initiatedBy: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
    },
    notes: {
      type: String,
    },
    paidAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

export default model("Payout", PayoutSchema);
