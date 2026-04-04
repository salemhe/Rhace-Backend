
import mongoose from "mongoose";

const tableSchema = new mongoose.Schema({
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: "Club", required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true, required: true },
  price: { type: Number, required: true },
  addOns: [{ type: String }],
  quantityAvailable: { type: Number, required: true, default: 0 },
  seatingCapacity: { type: Number, required: true, default: 0 },
  minimumSpend: { type: Number, default: 0 },
  images: [{ type: String }],
  tags: [{ type: String }],
  category: { type: String, enum: ["VIP", "VVIP", "Regular", "Super Regular"], default: "Regular"},
}, { timestamps: true });

const Table = mongoose.model("Table", tableSchema);

export default Table;
