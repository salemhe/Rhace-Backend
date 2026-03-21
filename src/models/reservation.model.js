import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const reservationSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
  vendorType: {
    type: String,
    enum: ["hotel", "restaurant", "club"],
    required: true,
  },
  tableType: { type: mongoose.Schema.Types.ObjectId, ref: "TableType" }, // Optional for hotels
  roomType: { type: mongoose.Schema.Types.ObjectId, ref: "RoomType" }, // For hotels
  guest: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
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
  payment: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentTransaction" },
  paymentStatus: {
    type: String,
    enum: ["pending", "paid", "partly_paid", "failed"],
    default: "pending",
    index: true
  },
}, { timestamps: true });

reservationSchema.plugin(mongoosePaginate);

const Reservation = mongoose.model("Reservation", reservationSchema);

export default Reservation;
