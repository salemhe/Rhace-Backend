
import mongoose from "mongoose";

const tableTypeSchema = new mongoose.Schema({
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: "Club", required: true },
  name: { type: String, required: true, trim: true },
  quantityAvailable: { type: Number, required: true, default: 0 },
  seatingCapacity: { type: Number, required: true, default: 0 },
  minimumSpend: { type: Number, default: 0 },
  images: [{ type: String }],
  tags: [{ type: String }],
}, { timestamps: true });

const TableType = mongoose.model("TableType", tableTypeSchema);

export default TableType;
