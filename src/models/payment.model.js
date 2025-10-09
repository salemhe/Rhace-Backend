
import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: "Club", required: true },
  reservationId: { type: mongoose.Schema.Types.ObjectId, ref: "Reservation", required: true },
  amount: { type: Number, required: true },
  currency: { type: String, required: true, default: "USD" },
  status: {
    type: String,
    enum: ["pending", "completed", "failed", "refunded"],
    default: "pending",
  },
  method: { type: String, enum: ["card", "cash", "transfer"], required: true },
  transactionId: { type: String }, // From payment provider
}, { timestamps: true });

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
