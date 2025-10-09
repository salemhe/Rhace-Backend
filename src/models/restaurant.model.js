import { Schema } from "mongoose";

const reservationSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    vendor: { type: Schema.Types.ObjectId, ref: "Vendor", required: true },
    customer_name: { type: String, required: true },
    customer_image: { type: String},
    customer_phone: { type: String, required: true },
    customer_email: { type: String, required: true },
    guests: { type: Number, required: true },
    date: { type: Date, required: true },
    time: { type: String, required: true },
    table_preference: { type: String },
    meal_preselected: { type: Boolean, default: false },
    payment_status: { type: String, enum: ["Pending", "Paid", "Pay at Restaurant"], default: "Pending" },
    reservation_status: { type: String, enum: ["Upcoming", "Confirmed", "Cancelled", "Completed"], default: "Pending" },
}, { timestamps: true });

export default mongoose.model("Reservation", reservationSchema);