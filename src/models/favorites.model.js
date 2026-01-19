import mongoose from "mongoose";

const favoritesSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
    vendorType: { type: String, enum: ["hotel", "restaurant", "club"], required: true },
    businessName: { type: String, required: true },
    logo: { type: String },
}, { timestamps: true });

// Ensure a user can't favorite the same vendor twice
favoritesSchema.index({ userId: 1, vendor: 1 }, { unique: true });

const Favorites = mongoose.model("Favorites", favoritesSchema);

export default Favorites;
