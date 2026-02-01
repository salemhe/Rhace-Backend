
import mongoose from "mongoose";

const tableSchema = new mongoose.Schema({
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: "Club", required: true },
  name: { type: String, required: true, trim: true },
  price: { type: Number, required: true },
  addOns: [{ type: String }],
}, { timestamps: true });

const Table = mongoose.model("Table", tableSchema);

export default Table;
