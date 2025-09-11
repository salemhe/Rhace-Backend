import mongoose from "mongoose";

const menuSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  coverImage: { type: String },
  menuType: { type: String },
  mealTimes: { type: [String] },
  pricingModel: { type: String, enum: ["fixed", "per-item"], default: "per-item" },
  branches: [{ type: mongoose.Schema.Types.ObjectId, ref: "Branch" }],
  items: [{ type: mongoose.Schema.Types.ObjectId, ref: "MenuItem" }],
  published: { type: Boolean, default: false },
});

const Menu = mongoose.model("Menu", menuSchema);



const menuItemSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true },
    category: { type: String },
    tags: [{ type: String }],
    images: [{ type: String }],
    availability: { type: Boolean, default: true },
    addOns: [{
        name: { type: String },
        price: { type: Number },
    }],
    variants: [{
        name: { type: String },
        price: { type: Number },
    }],
});

const MenuItem = mongoose.model("MenuItem", menuItemSchema);

export { Menu, MenuItem };
