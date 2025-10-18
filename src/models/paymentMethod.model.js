
import mongoose from "mongoose";

const paymentMethodSchema = new mongoose.Schema({
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: "Club", required: true },
  name: { type: String, required: true }, // e.g., "Credit Card", "Cash", "Online"
  provider: { type: String }, // e.g., "Stripe", "PayPal"
  isEnabled: { type: Boolean, default: true },
}, { timestamps: true });

const PaymentMethod = mongoose.model("PaymentMethod", paymentMethodSchema);

export default PaymentMethod;
