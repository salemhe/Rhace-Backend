import mongoose from "mongoose";

const amenitySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  scope: {
    type: String,
    enum: ["global", "account", "hotel"],
    default: "global",
  },
  active: { type: Boolean, default: true },
}, { timestamps: true });

const Amenity = mongoose.model("Amenity", amenitySchema);

export default Amenity;
