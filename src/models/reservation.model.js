import mongoose from "mongoose";

const reservationSchema = new mongoose.Schema({
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: "Club", required: true },
  tableType: { type: mongoose.Schema.Types.ObjectId, ref: "TableType", required: true },
  guest: { type: mongoose.Schema.Types.ObjectId, ref: "Guest", required: true },
  checkInDate: { type: Date, required: true },
  checkOutDate: { type: Date, required: true },
  partySize: { type: Number, required: true },
  minSpend: { type: Number, default: 0 },
  deposit: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ["pending", "confirmed", "seated", "cancelled", "no-show"],
    default: "pending",
  },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
}, { timestamps: true });

const Reservation = mongoose.model("Reservation", reservationSchema);

export default Reservation;
