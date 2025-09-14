import mongoose from "mongoose";

const paymentSettingsSchema = new mongoose.Schema({
  hotelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hotel", required: true, unique: true },
  requireFullPayment: { type: Boolean, default: true },
  allowPartPayment: { type: Boolean, default: false },
  allowPayAtHotel: { type: Boolean, default: false },
  acceptedMethods: [{ type: String }], // e.g., ["credit-card", "paypal", "bank-transfer"]
  instructions: { type: String },
}, { timestamps: true });

const PaymentSettings = mongoose.model("PaymentSettings", paymentSettingsSchema);

export default PaymentSettings;