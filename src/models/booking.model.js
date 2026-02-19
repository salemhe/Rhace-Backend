// models/booking.model.js

import mongoose from 'mongoose';

const options = {
    discriminatorKey: "reservationType",
    collection: "reservations",
    timestamps: true
};

const bookingSchema = new mongoose.Schema({
    resId: { 
        type: String, 
        required: true,
        unique: true,
        index: true
    },
    bookingCode: { 
        type: String,
        required: true,
        unique: true,
        index: true
    },
    paymentRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payment',
        required: true,
        index: true
    },
    customerName: { 
        type: String, 
        required: true 
    },
    customerId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User",
        required: true,
        index: true
    },
    customerEmail: { 
        type: String, 
        required: true,
        lowercase: true,
        trim: true
    },
    vendor: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "Vendor",
        required: true,
        index: true
    },
    location: { 
        type: String, 
        required: true 
    },
    paymentStatus: { 
        type: String,
        enum: ['pending', 'paid', 'partly_paid', 'refunded', 'failed', 'not_paid'],
        default: 'pending',
        required: true,
        index: true
    },
    partPaid: Boolean,
    reservationStatus: { 
        type: String,
        enum: ['upcoming', 'completed', 'cancelled', 'no_show'],
        default: 'upcoming',
        required: true,
        index: true
    },
    totalAmount: { 
        type: Number, 
        required: true,
        min: 0
    },
    payLater: { 
        type: Boolean, 
        default: false 
    },
    cancelledAt: Date,
    cancellationReason: String,
    cancelledBy: {
        type: String,
        enum: ['customer', 'vendor', 'admin']
    },
    refundAmount: Number,
    refundedAt: Date,
    reservationType: { 
        type: String,
        required: true
    }
    
}, options);

bookingSchema.index({ vendor: 1, reservationStatus: 1, createdAt: -1 });

bookingSchema.index({ customerId: 1, reservationStatus: 1, createdAt: -1 });

bookingSchema.index({ paymentStatus: 1, createdAt: -1 });

const Booking = mongoose.model("Booking", bookingSchema);

const restaurantReservation = Booking.discriminator(
    "restaurantReservation",
    new mongoose.Schema({
        date: { type: Date, required: true },
        time: { type: String, required: true },
        guests: { type: Number, required: true, min: 1 },
        mealPreselected: { type: Boolean, default: false },
        menus: [{
            menu: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "MenuItem",
                required: true
            },
            quantity: {
                type: Number,
                required: true,
                min: 1
            },
            specialRequest: String
        }],
        specialOccasion: String,
        seatingPreference: String,
        specialRequest: String
    })
);

const hotelReservation = Booking.discriminator(
    "hotelReservation",
    new mongoose.Schema({
        checkInDate: { type: Date, required: true },
        checkOutDate: { type: Date, required: true },
        guests: { type: Number, required: true, min: 1 },
        room: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: "RoomType",
            required: true
        },
        specialRequest: String
    })
);

const clubReservation = Booking.discriminator(
    "clubReservation",
    new mongoose.Schema({
        date: { type: Date, required: true },
        time: { type: String, required: true },
        guests: { type: Number, required: true, min: 1 },
        table: String,
        combos: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "BottleSet"
        }],
        drinks: [{
            drink: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Drink",
                required: true
            },
            quantity: {
                type: Number,
                required: true,
                min: 1
            }
        }],
        specialRequest: String
    })
);

export { 
    Booking, 
    restaurantReservation, 
    hotelReservation, 
    clubReservation 
};