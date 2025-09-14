import mongoose from "mongoose";

const roomTypeSchema = new mongoose.Schema({
  hotelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hotel", required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  pricePerNight: { type: Number, required: true, min: 0 },
  adultsCapacity: { type: Number, required: true, min: 1 },
  childrenCapacity: { type: Number, default: 0, min: 0 },
  totalUnits: { type: Number, required: true, min: 0 }, // Total available rooms of this type
  amenities: [{ type: mongoose.Schema.Types.ObjectId, ref: "Amenity" }],
  images: [{ type: String }], // URLs of room images
}, { timestamps: true });

const RoomType = mongoose.model("RoomType", roomTypeSchema);

export default RoomType;