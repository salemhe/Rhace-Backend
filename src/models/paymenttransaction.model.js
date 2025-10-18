import mongoose from "mongoose";

const paymentTransactionSchema = new mongoose.Schema({
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
  amount: { type: Number, required: true },
  method: { type: String, required: true }, // e.g., "credit-card", "paypal"
  providerRef: { type: String }, // Reference from the payment provider (e.g., Stripe charge ID)
  status: {
    type: String,
    enum: ["pending", "succeeded", "failed", "refunded"],
    required: true,
    default: "pending",
  },
}, { timestamps: true }); // Add timestamps for createdAt and updatedAt

const PaymentTransaction = mongoose.model("PaymentTransaction", paymentTransactionSchema);

export default PaymentTransaction;