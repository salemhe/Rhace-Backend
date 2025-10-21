
import mongoose from "mongoose";

const drinkSchema = new mongoose.Schema({
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: "Club", required: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, required: true },
  volume: { type: String, trim: true },
  price: { type: Number, required: true },
  quantity: { type: Number, default: 0 },
  images: [{ type: String }],
  status: {
    type: String,
    enum: ["Active", "hidden"],
    default: "Active",
  },
  showOnBookingScreen: { type: Boolean, default: true },
  addOns: [{ type: String }],
}, { timestamps: true });

const Drink = mongoose.model("Drink", drinkSchema);

export default Drink;
