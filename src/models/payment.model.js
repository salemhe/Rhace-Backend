
import mongoose from "mongoose";

const PaymentSchema = new mongoose.Schema({
    vendor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vendor",
        required: true,
    },
    customer_name: {
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
    status: {
        type: String,
        enum: ["Pending", "Paid", "Part-paid", "Failed"],
        default: "Pending",
    },
}, { timestamps: true });

const Payment = mongoose.model("Payment", PaymentSchema);

export default Payment;
