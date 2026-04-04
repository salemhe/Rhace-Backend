import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },
    paymentMethod: {
      type: String,
    },
    isSplitPayment: {
      type: Boolean,
      default: false,
    },
    booking: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "success", "failed", "cancelled"],
      default: "pending",
      required: true,
      index: true,
    },
    booked: {
      type: Boolean,
      default: false,
      index: true,
    },
    bookedAt: {
      type: Date,
    },
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    customerName: {
      type: String,
      required: true,
    },
    customerPhone: String,
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    amountPaid: {
      type: Number,
      required: true,
      min: 0,
    },
    payLater: {
      type: Boolean,
      default: false,
    },
    partPaid: {
      type: Boolean,
      default: false,
    },
    metadata: {
      vendorId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
      },
      reservationType: {
        type: String,
        enum: ["restaurant", "hotel", "club"],
        required: true,
      },
      location: String,

      customerName: String,
      customerEmail: String,
      customerPhone: String,

      date: Date,
      time: String,
      guests: Number,
      mealPreselected: Boolean,
      menus: [
        {
          menuId: mongoose.Schema.Types.ObjectId,
          quantity: Number,
          specialRequest: String,
        },
      ],
      specialOccasion: String,
      seatingPreference: String,
      specialRequest: String,

      checkInDate: Date,
      checkOutDate: Date,
      rooms: [
        {
          roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
          quantity: Number,
          guests: Number,
          checkInDate: { type: Date, required: true },
          checkOutDate: {
            type: Date,
            required: true,
            validate: {
              validator: function (value) {
                return value >= this.checkInDate;
              },
              message: "Checkout date must be same or after the Checkin date",
            },
          },
        },
      ],

      drinks: [
        {
          drink: { type: mongoose.Schema.Types.ObjectId, ref: "Drink" },
          quantity: Number,
        },
      ],
      combos: [mongoose.Schema.Types.ObjectId],
      table: [
        {
          _id: { type: mongoose.Schema.Types.ObjectId, ref: "Table" },
          quantity: Number,
          price: Number,
        },
      ],
    },
    webhookProcessed: {
      type: Boolean,
      default: false,
      index: true,
    },
    webhookProcessedAt: Date,
    vendorConfirmed: {
        type: Boolean,
        default: false,
        index: true
    },
    vendorConfirmedAt: Date,
    webhookAttempts: {
      type: Number,
      default: 0,
    },
    paystackReference: {
      type: String,
      sparse: true,
      index: true,
    },
    paystackData: mongoose.Schema.Types.Mixed,
    paidAt: Date,
    failureReason: String,
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
    },
  },
  { timestamps: true },
);

paymentSchema.index({ booking: 1, booked: 1 });
paymentSchema.index({ paystackReference: 1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ user: 1, createdAt: -1 });
paymentSchema.index({ vendor: 1, createdAt: -1 });

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;
