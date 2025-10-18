import { Schema, model } from "mongoose";

const NoShowPenaltySchema = new Schema(
  {
    reservation: {
      type: Schema.Types.ObjectId,
      ref: "Reservation",
      required: true,
    },
    guest: {
      type: Schema.Types.ObjectId,
      ref: "Guest",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "NGN",
    },
    status: {
      type: String,
      enum: ["pending", "charged", "waived"],
      default: "pending",
    },
    chargedAt: {
      type: Date,
    },
    waivedBy: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
    },
    waiverReason: {
      type: String,
    },
  },
  { timestamps: true }
);

export default model("NoShowPenalty", NoShowPenaltySchema);
