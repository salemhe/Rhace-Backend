import mongoose from "mongoose";

const guestSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  document: {
    type: {
      type: String, // e.g., "passport", "ID card"
    },
    number: { type: String },
  }, // Optional document information
}, { timestamps: true });

const Guest = mongoose.model("Guest", guestSchema);

export default Guest;