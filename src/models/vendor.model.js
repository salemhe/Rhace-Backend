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
    logo: {
      type: String,
      validate: {
        validator: (value) =>
          /^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|svg))$/.test(value) || value === null,
        message: "Logo must be a valid URL.",
      },
      default: null,
    },
    businessDescription: { type: String },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    address: { type: String },
    password: { type: String },
    role: { type: String, default: "vendor" },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], index: "2dsphere", default: [0, 0] },
    },
    profileImages: [
      {
        type: String,
        validate: {
          validator: (value) =>
            /^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|svg))$/.test(value) || value === null,
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
    vendorTypeCategory: { type: String, default: "General" },
    branch: { type: String },
    status: { type: String, default: "pending" },
    isVisible: { type: Boolean, default: false },
    vendorType: { type: String },
    specialCategory: { type: String },
    contactPerson: { type: String, default: "Not specified" },
    acceptsOnlineBooking: { type: Boolean, default: true },
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

// ─── Hotel discriminator ──────────────────────────────────────────────────────
const HotelVendor = Vendor.discriminator(
  "hotel",
  new mongoose.Schema({
    totalBooked: { type: Number, default: 0 },
    offer: { type: String },
    policies: [{ type: String }],

    starRating: { type: Number, enum: [1, 2, 3, 4, 5], default: 3 },
    propertyType: {
      type: String,
      enum: ["hotel", "boutique", "resort", "serviced-apartment", "motel", "guesthouse"],
      default: "hotel",
    },
    amenities: [{
      type: String,
      enum: [
        "wifi", "pool", "gym", "spa", "parking", "restaurant", "bar",
        "airport-shuttle", "ac", "hot-tub", "room-service", "laundry",
        "business-center", "kids-club", "ev-charging", "beach-access",
      ],
    }],
    mealPlan: {
      type: String,
      enum: ["room-only", "breakfast", "half-board", "full-board", "all-inclusive"],
      default: "room-only",
    },
    cancellationPolicy: {
      type: String,
      enum: ["free", "non-refundable", "partial"],
      default: "free",
    },
    instantBook: { type: Boolean, default: false },
    petFriendly: { type: Boolean, default: false },
    payAtProperty: { type: Boolean, default: false },
    accessibilityFeatures: [{
      type: String,
      enum: ["step-free", "elevator", "wheelchair", "grab-bars", "visual-aids", "hearing-loop"],
    }],
    checkInTime: { type: String, default: "14:00" },
    checkOutTime: { type: String, default: "11:00" },
    openingHours: [{
      day: { type: String, enum: ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"] },
      open: { type: String },
      close: { type: String },
      isClosed: { type: Boolean, default: false },
    }],
  })
);

// ─── Restaurant discriminator ─────────────────────────────────────────────────
const RestaurantVendor = Vendor.discriminator(
  "restaurant",
  new mongoose.Schema({
    openingTime: { type: String },
    closingTime: { type: String },
    availableSlots: [{ type: String }],

    cuisines: [{
      type: String,
      enum: [
        "nigerian", "continental", "chinese", "italian", "indian", "japanese",
        "lebanese", "mexican", "american", "french", "mediterranean",
        "fast-food", "seafood", "grills", "pastry", "vegetarian", "fusion",
      ],
    }],
    diningStyles: [{
      type: String,
      enum: ["dine-in", "takeout", "delivery", "buffet", "fine-dining", "casual"],
    }],
    dietaryOptions: [{
      type: String,
      enum: ["halal", "vegetarian", "vegan", "gluten-free", "kosher", "dairy-free", "nut-free"],
    }],
    seatOptions: [{
      type: String,
      enum: ["outdoor", "bar-seating", "private-room", "high-chair", "rooftop", "booth"],
    }],
    occasionTags: [{
      type: String,
      enum: ["romantic", "birthday", "business", "group", "date-night", "family", "brunch", "celebrations"],
    }],
    mealTimes: [{
      type: String,
      enum: ["breakfast", "brunch", "lunch", "dinner", "late-night", "all-day"],
    }],
    reservationPolicy: {
      type: String,
      enum: ["free", "deposit", "prepay", "walk-in-only"],
      default: "free",
    },
    hasParking: { type: Boolean, default: false },
    hasOutdoorSeating: { type: Boolean, default: false },
    openingHours: [{
      day: { type: String, enum: ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"] },
      open: { type: String },
      close: { type: String },
      isClosed: { type: Boolean, default: false },
    }],
  })
);

// ─── Club discriminator ───────────────────────────────────────────────────────
const ClubVendor = Vendor.discriminator(
  "club",
  new mongoose.Schema({
    openingTime: { type: String },
    closingTime: { type: String },
    slots: { type: Number },
    categories: [{ type: String }],
    offer: { type: String },

    venueType: {
      type: String,
      enum: ["club", "lounge", "rooftop", "sports-bar", "cocktail-bar", "karaoke", "jazz-bar", "pool-bar"],
      default: "club",
    },
    musicGenres: [{
      type: String,
      enum: ["afrobeats", "house", "rnb", "hiphop", "edm", "reggae", "highlife", "dancehall", "amapiano", "mixed", "live-band"],
    }],
    livePerformanceTypes: [{
      type: String,
      enum: ["dj", "live-band", "standup", "karaoke", "spoken-word"],
    }],
    dressCode: [{ type: String }],
    agePolicy: {
      type: String,
      enum: ["18+", "21+", "all-ages"],
      default: "18+",
    },
    entryFee: { type: Number, default: 0 },
    bottleServiceMin: { type: Number, default: 0 },
    hasVIPTables: { type: Boolean, default: false },
    hasGuestlist: { type: Boolean, default: false },
    hasOutdoorArea: { type: Boolean, default: false },
    hasSmokingArea: { type: Boolean, default: false },
    hasParking: { type: Boolean, default: false },
    happyHour: {
      start: { type: String },
      end: { type: String },
      days: [{ type: String, enum: ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"] }],
      description: { type: String, trim: true },
    },
    openingHours: [{
      day: { type: String, enum: ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"] },
      open: { type: String },
      close: { type: String },
      isClosed: { type: Boolean, default: false },
    }],
  })
);

VendorBaseSchema.index({ location: "2dsphere" });
VendorBaseSchema.index(
  {
    businessName: "text",
    businessDescription: "text",
    vendorTypeCategory: "text",
    address: "text",
  },
  {
    weights: {
      businessName: 10,
      vendorTypeCategory: 5,
      businessDescription: 2,
      address: 1,
    },
    name: "vendor_text_index",
  }
);
VendorBaseSchema.index({ isVerified: 1, isVisible: 1, rating: -1 });
VendorBaseSchema.index({ isVerified: 1, isVisible: 1, vendorType: 1, rating: -1 });
VendorBaseSchema.index({ "cuisines": 1 });
VendorBaseSchema.index({ "dietaryOptions": 1 });
VendorBaseSchema.index({ "musicGenres": 1 });
VendorBaseSchema.index({ "amenities": 1 });
VendorBaseSchema.index({ "starRating": 1 });
VendorBaseSchema.index({ "entryFee": 1 });

export { Vendor, HotelVendor, RestaurantVendor, ClubVendor };