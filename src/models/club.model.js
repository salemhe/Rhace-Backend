
import mongoose from "mongoose";

const clubSchema = new mongoose.Schema({
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
  category: { type: String, trim: true },
  shortDescription: { type: String, trim: true },
  dressCode: { type: String, trim: true },
  ageRestriction: { type: String, trim: true },
  branchCode: { type: String, unique: true, trim: true }, // Auto-generated, unique
  logoUrl: { type: String },
  coverUrl: { type: String },
  status: {
    type: String,
    enum: ["opened", "closed"],
    default: "closed",
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

const Club = mongoose.model("Club", clubSchema);

export default Club;
