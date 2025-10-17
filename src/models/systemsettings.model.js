import mongoose from "mongoose";

const systemSettingsSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ["general", "vendor", "reservation", "payment", "notifications", "security"],
      required: true,
      unique: true,
    },
    settings: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  { timestamps: true }
);

const SystemSettings = mongoose.model("SystemSettings", systemSettingsSchema);

export default SystemSettings;
