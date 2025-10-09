
import mongoose from "mongoose";

const bottleSetSchema = new mongoose.Schema({
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: "Club", required: true },
  name: { type: String, required: true, trim: true },
  items: [
    {
      drinkId: { type: mongoose.Schema.Types.ObjectId, ref: "Drink", required: true },
      quantity: { type: Number, required: true, default: 1 },
      order: { type: Number, required: true, default: 0 },
    },
  ],
  images: [{ type: String }],
  setPrice: { type: Number, required: true },
}, { timestamps: true });

const BottleSet = mongoose.model("BottleSet", bottleSetSchema);

export default BottleSet;
