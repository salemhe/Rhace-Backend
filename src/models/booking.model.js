import mongoose, { Schema } from "mongoose";

// Discriminator options
const options = {
  discriminatorKey: "reservationType",
  collection: "reservations",
  timestamps: true,
};

// Define base schema
const bookingSchema = new Schema(
  {
    customerName: { type: String },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    customerEmail: { type: String },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },
    paymentStatus: { type: String },
    reservationStatus: { type: String }, // ✅ Fixed typo here: "typr" → "type"
    reservationType: { type: String },
    image: { type: String },
    location: { type: String },
    totalAmount: { type: Number },
    bookingCode: { type: String },
  },
  options
);

// ✅ Use model caching to prevent OverwriteModelError
const Booking = mongoose.model("Booking", bookingSchema);

// ✅ Also use caching for the discriminator
const restaurantReservation =
  // mongoose.models.restaurant ||
  Booking.discriminator(
    "restaurantReservation",
    new mongoose.Schema({
      date: { type: Date },
      time: { type: String },
      guests: { type: Number },
      mealPreselected: { type: Boolean },
      menus: [
        {
          menu: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MenuItem",
            required: true,
          },
          quantity: {
            type: Number,
            required: true,
            min: 1,
          },
          specialRequest: {
            type: String,
          },
        },
      ],
      specialOccasion: { type: String },
      seatingPreference: { type: String },
      specialRequest: { type: String },
    })
  );

const hotelReservation =
  // mongoose.models.restaurant ||
  Booking.discriminator(
    "hotelReservation",
    new mongoose.Schema({
      checkInDate: { type: Date },
      checkOutDate: { type: Date },
      guests: { type: Number },
      room: { type: mongoose.Schema.Types.ObjectId, ref: "RoomType" },
      specialRequest: { type: String },
    })
  );

const clubReservation =
  // mongoose.models.restaurant ||
  Booking.discriminator(
    "clubReservation",
    new mongoose.Schema({
      date: { type: Date },
      guests: { type: Number },
      table: { type: String },
      combos: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "BottleSet",
      }],
      drinks: [
        {
          drink: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Drink",
            required: true,
          },
          quantity: {
            type: Number,
            required: true,
            min: 1,
          },
        }
      ],
      specialRequest: { type: String },
    })
  );

export { Booking, restaurantReservation, hotelReservation, clubReservation };
