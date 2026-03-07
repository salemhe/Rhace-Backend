import mongoose from "mongoose";

const reservationHoldSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ["hotel", "room", "club", "table", "restaurant"],
    required: true
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  date: Date,
  checkInDate: Date,
  checkOutDate: Date,
  time: String,
  quantity: {
    type: Number,
    default: 1,
    min: 1
  },
  status: {
    type: String,
    enum: ["active", "used", "released", "expired"],
    default: "active"
  },
  expiresAt: {
    type: Date,
    required: true
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking"
  }
}, { timestamps: true });

// TTL index to auto-delete expired holds
reservationHoldSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for finding user's active hold
reservationHoldSchema.index({ userId: 1, status: 1, expiresAt: 1 });

const ReservationHold = mongoose.model("ReservationHold", reservationHoldSchema);

export default ReservationHold;
