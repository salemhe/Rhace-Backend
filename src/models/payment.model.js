import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  reservation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Reservation",
    required: true,
  },
  amount: { type: Number, required: true },
  status: {
    type: String,
    enum: ["Pending", "Completed", "Failed", "Refunded"],
    default: "Pending",
  },
  paymentMethod: {
    type: String,
    enum: ["Card", "Bank Transfer", "Paystack"],
  },
  transactionId: { type: String }, // From payment gateway
  createdAt: { type: Date, default: Date.now },
});

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
