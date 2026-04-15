import mongoose from "mongoose";

const searchHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  vendorType: { type: String, enum: ["hotel", "restaurant", "club"], default: "restaurant"},
  query: { type: String },
  clickedVendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor"}
}, {
  timestamps: true
});

const SearchHistory = mongoose.model("SearchHistory", searchHistorySchema);

export default SearchHistory;
