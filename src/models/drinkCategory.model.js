
import mongoose from "mongoose";

const drinkCategorySchema = new mongoose.Schema({
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: "Club", required: true },
  name: { type: String, required: true, trim: true },
}, { timestamps: true });

const DrinkCategory = mongoose.model("DrinkCategory", drinkCategorySchema);

export default DrinkCategory;
