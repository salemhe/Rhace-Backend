import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema({
  bookingCode: { type: String, required: true, unique: true },
  hotel: { type: mongoose.Schema.Types.ObjectId, ref: "Hotel", required: true },
  roomType: { type: mongoose.Schema.Types.ObjectId, ref: "RoomType", required: true },
  guest: { type: mongoose.Schema.Types.ObjectId, ref: "Guest", required: true },
  checkInDate: { type: Date, required: true },
  checkOutDate: { type: Date, required: true },
  guestsCount: {
      adults: { type: Number, required: true },
      children: { type: Number, default: 0 }
  },
  status: {
    type: String,
    enum: ["upcoming", "completed", "canceled", "no-show"],
    default: "upcoming",
  },
  totalAmount: { type: Number, required: true },
  currency: { type: String, required: true, default: "USD" },
  paymentStatus: {
    type: String,
    enum: ["unpaid", "partly-paid", "fully-paid", "refunded"],
    default: "unpaid",
  },
  mealSelections: [{
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: "Menu" },
    quantity: { type: Number, default: 1 },
  }],
  source: { type: String, default: "direct" }, // e.g., "direct", "website", "phone", "app"
  notes: { type: String },
}, { timestamps: true });

const Booking = mongoose.model("Booking", bookingSchema);

export default Booking;
