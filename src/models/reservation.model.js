import mongoose from "mongoose";

const reservationSchema = new mongoose.Schema({
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  dateTime: { type: Date, required: true },
  tablePreference: { type: String },
  guestCount: { type: Number, required: true },
  specialRequests: { type: String },
  status: {
    type: String,
    enum: ["Upcoming", "Completed", "Canceled", "No-show"],
    default: "Upcoming",
  },
  paymentStatus: {
    type: String,
    enum: ["Pending", "Paid", "Refunded"],
    default: "Pending",
  },
  mealPreselected: { type: Boolean, default: false },
  branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true },
  // Link to payment record
  payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
});

const Reservation = mongoose.model("Reservation", reservationSchema);

export default Reservation;
