import mongoose from "mongoose";

const roomTypeSchema = new mongoose.Schema({
  hotelId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  pricePerNight: { type: Number, required: true, min: 0 },

  roomCategory: {
    type: String,
    enum: ["standard", "deluxe", "suite", "presidential", "studio", "penthouse"],
    default: "standard",
  },

  bedType: {
    type: String,
    enum: ["king", "queen", "twin", "double", "single", "bunk"],
    default: "single",
  },

  adultsCapacity: { type: Number, required: true, min: 1 },
  childrenCapacity: { type: Number, default: 0, min: 0 },
  totalUnits: { type: Number, required: true, min: 0 },

  amenities: [{ type: String }],
  images: [{ type: String }],

  discount: { type: Number, default: 0 },
  isAvailable: { type: Boolean, default: true },
}, { timestamps: true });

roomTypeSchema.index({ hotelId: 1 });
roomTypeSchema.index({ pricePerNight: 1 });
roomTypeSchema.index({ roomCategory: 1 });

const RoomType = mongoose.model("RoomType", roomTypeSchema);

export default RoomType;