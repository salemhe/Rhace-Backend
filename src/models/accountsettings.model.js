import mongoose from "mongoose";

const accountSettingsSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  currency: { type: String, default: "NGN" },
  timezone: { type: String, default: "UTC" },
  defaultPolicies: {
    type: Object, // Flexible object for default policies like minLeadTime, cutOffTime, etc.
    default: {},
  },
  businessLogo: { type: String }, // URL or path to business logo
}, { timestamps: true });

const AccountSettings = mongoose.model("AccountSettings", accountSettingsSchema);

export default AccountSettings;
