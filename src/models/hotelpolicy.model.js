import mongoose from "mongoose";

const hotelPolicySchema = new mongoose.Schema({
  hotelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hotel", required: true, unique: true },
  checkInTime: { type: String, default: "15:00" }, // e.g., "15:00"
  checkOutTime: { type: String, default: "11:00" }, // e.g., "11:00"
  minLeadHours: { type: Number, default: 0, min: 0 }, // Minimum lead time to book in hours
  maxAdvanceDays: { type: Number, default: 365, min: 0 }, // Maximum days in advance to book
  cancellationType: {
    type: String,
    enum: ["flexible", "moderate", "strict", "custom"],
    default: "flexible",
  },
  freeCancelHours: { type: Number, default: 0, min: 0 }, // Free cancellation up to X hours before check-in
  customPolicyNote: { type: String },
}, { timestamps: true });

const HotelPolicy = mongoose.model("HotelPolicy", hotelPolicySchema);

export default HotelPolicy;