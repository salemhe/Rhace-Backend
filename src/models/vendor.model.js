import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt";
import geocoder from "../utils/geocoder.js";

const options = {
  discriminatorKey: "vendorType",
  collection: "vendors",
  timestamps: true,
};

const VendorBaseSchema = new Schema(
  {
    businessName: { type: String, required: true },
    businessDescription: { type: String },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    address: { type: String },
    password: { type: String },
    role: { type: String, default: "vendor" },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        index: "2dsphere",
      },
    },
    profileImages: [
      {
        type: String,
        validate: {
          validator: function (value) {
            return (
              /^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|svg))$/.test(value) ||
              value === null
            );
          },
          message: "Profile image must be a valid URL.",
        },
        default: null,
      },
    ],
    paymentDetails: {
      bankCode: { type: String },
      accountNumber: { type: String },
      subaccountCode: { type: String },
      bankName: { type: String },
      accountName: { type: String },
    },
    percentageCharge: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    isVerified: { type: Boolean, default: false },
    rating: { type: Number, default: 0 },
    reviews: { type: Number, default: 0 },
    isOnboarded: { type: Boolean, default: false },
    website: { type: String, trim: true },
    priceRange: { type: Number, default: 0 },
    vendorTypeCategory: { type: String },
    branch: { type: String },
    isVisible: { type: Boolean, default: false },
    vendorType: { type: String },
  },
  options
);

VendorBaseSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

VendorBaseSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

VendorBaseSchema.pre("save", async function (next) {
  if (!this.isModified("address") || !this.address) return next();
  try {
    const loc = await geocoder.geocode(this.address);
  
    if (loc.length > 0) {
      this.location = {
        type: "Point",
        coordinates: [loc[0].longitude, loc[0].latitude],
      };
    }
  } catch (error) {
    console.error("Error geocoding address:", error);
  }
  next();
});

const Vendor = mongoose.model("Vendor", VendorBaseSchema);

// Hotel schema
const HotelVendor = Vendor.discriminator(
  "hotel",
  new mongoose.Schema({
    totalBooked: { type: Number, default: 0 },
    offer: { type: String },
  })
);

// Restaurant schema
const RestaurantVendor = Vendor.discriminator(
  "restaurant",
  new mongoose.Schema({
    openingTime: { type: String },
    closingTime: { type: String },
    cuisines: [{ type: String }],
    availableSlots: [{ type: String }],
  })
);

// Club schema
const ClubVendor = Vendor.discriminator(
  "club",
  new mongoose.Schema({
    openingTime: { type: String },
    closingTime: { type: String },
    slots: { type: Number },
    categories: [{ type: String }],
    offer: { type: String },
    dressCode: [{ type: String }],
    ageLimit: { type: String },
  })
);

export { Vendor, HotelVendor, RestaurantVendor, ClubVendor };
