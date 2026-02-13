
import mongoose from "mongoose";

const PaymentSchema = new mongoose.Schema({
    vendor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vendor",
        required: true,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    customerName: {
        type: String,
        required: true,
    },
    email: {
        type: String,},
    paymentMethod: {
        type: String,
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    amountPaid: {
        type: Number,
        required: true,
    },
    booking: {
        type: String,
        ref: "Booking",
    },
    reference: {
        type: String,
        unique: true,
    },
    status: {
        type: String,
        enum: ["Pending", "Paid", "Part-paid", "Failed"],
        default: "Pending",
    },
    isSplitPayment: { type: Boolean, default: false },

    paidAt: { type: Date },
}, { timestamps: true });

const Payment = mongoose.model("Payment", PaymentSchema);

export default Payment;
