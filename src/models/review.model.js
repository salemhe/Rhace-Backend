import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
  user: { type: String, default: "Anonymous"},
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true },
}, {
  timestamps: true
});

const Review = mongoose.model("Review", reviewSchema);

export default Review;
