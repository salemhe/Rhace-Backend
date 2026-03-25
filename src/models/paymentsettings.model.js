import mongoose from "mongoose";

const paymentSettingsSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, unique: true },
  subaccountCode: { type: String }, // Auto-generated Paystack subaccount
  requireFullPayment: { type: Boolean, default: true },
  allowPartPayment: { type: Boolean, default: false },
  allowPayLater: { type: Boolean, default: true },
  acceptedMethods: [{ type: String }], // e.g., ["card", "bank_transfer", "ussd"]
  instructions: { type: String },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const PaymentSettings = mongoose.model("PaymentSettings", paymentSettingsSchema);

export default PaymentSettings;