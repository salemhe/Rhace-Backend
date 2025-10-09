
import mongoose from "mongoose";

const addOnSchema = new mongoose.Schema({
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: "Club", required: true },
  name: { type: String, required: true, trim: true },
  price: { type: Number, required: true },
  discountPrice: { type: Number },
  minOrderQuantity: { type: Number, default: 1 },
  enablePriceVisibility: { type: Boolean, default: true },
}, { timestamps: true });

const AddOn = mongoose.model("AddOn", addOnSchema);

export default AddOn;
