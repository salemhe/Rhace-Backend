import mongoose from "mongoose";

const hotelSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  address: {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zip: { type: String, trim: true },
    country: { type: String, trim: true },
    fullAddress: { type: String, trim: true }, // To store the full formatted address
  },
  coordinates: {
    latitude: { type: Number },
    longitude: { type: Number },
  },
  type: { type: String, trim: true }, // e.g., "Apartment", "Hotel"
  categories: [{ type: String, trim: true }], // e.g., ["Standard", "Luxury", "Business"]
  branchCode: { type: String, unique: true, trim: true }, // Auto-generated, unique
  logoUrl: { type: String },
  coverUrl: { type: String },
  status: {
    type: String,
    enum: ["draft", "published", "archived"],
    default: "draft",
  },
  policyId: { type: mongoose.Schema.Types.ObjectId, ref: "HotelPolicy" },
  paymentSettingsId: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentSettings" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

const Hotel = mongoose.model("Hotel", hotelSchema);

export default Hotel;