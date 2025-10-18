
import mongoose from "mongoose";

const refundSchema = new mongoose.Schema({
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", required: true },
  amount: { type: Number, required: true },
  reason: { type: String, trim: true },
  status: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "pending",
  },
}, { timestamps: true });

const Refund = mongoose.model("Refund", refundSchema);

export default Refund;
