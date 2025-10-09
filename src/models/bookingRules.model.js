
import mongoose from "mongoose";

const bookingRulesSchema = new mongoose.Schema({
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: "Club", required: true, unique: true },
  minSpend: { type: Number, default: 0 },
  depositRequired: { type: Boolean, default: false },
  maxGuestsPerTable: { type: Number, default: 0 },
  cancellationPolicy: { type: String, trim: true },
  refundProcessingDays: { type: Number, default: 0 },
  paymentRules: {
    fullPayment: { type: Boolean, default: false },
    partPayment: { type: Boolean, default: false },
    atVenue: { type: Boolean, default: true },
  },
}, { timestamps: true });

const BookingRules = mongoose.model("BookingRules", bookingRulesSchema);

export default BookingRules;
