import mongoose from "mongoose";

const menuSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
  name: { type: String, required: true },
  description: { type: String },
  coverImage: { type: String },
  menuType: [{ type: String }],
  mealTimes: [{ type: String }],
  pricingModel: { type: String, enum: ["fixed", "per-item"], default: "per-item" },
  price: { type: Number },
  items: [{ type: mongoose.Schema.Types.ObjectId, ref: "MenuItem" }],
  published: { type: Boolean, default: false },
  tags: [{ type: String }],
  status: { type: String, enum: ["active", "inactive"], default: "active" },
  id: { type: String, required: true }
}, {
    timestamps: true,
});

const Menu = mongoose.model("Menu", menuSchema);



const menuItemSchema = new mongoose.Schema({
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true },
    category: { type: String },
    discount: { type: Boolean },
    discountPrice: { type: Number },
    mealTimes: [{ type: String }],
    tags: [{ type: String }],
    images: { type: String },
    availability: { type: Boolean, default: true },
    isVisible: { type: Boolean, default: true },
    tags: [{ type: String }],
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    mealTime: [{ type: String }],
    discount: { type: Boolean , default: false },
    discountPrice: { type: Number },
    addOns: { type: Boolean , default: false },
    assignedMenu: { type: String },
    // variants: [{
    //     name: { type: String },
    //     price: { type: Number },
    // }],
}, {
    timestamps: true,
});

const MenuItem = mongoose.model("MenuItem", menuItemSchema);

export { Menu, MenuItem };
