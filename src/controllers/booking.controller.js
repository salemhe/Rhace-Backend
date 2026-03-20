import mongoose from "mongoose";
import {
  Booking,
  clubReservation,
  hotelReservation,
  restaurantReservation,
} from "../models/booking.model.js";
import Payment from "../models/payment.model.js";
import { sendBookingConfirmationEmail } from "../services/mail.service.js";
import { getVendorSocket, getUserSocket } from "../websockets/socketManager.js";
import dayjs from "dayjs";
import axios from "axios";
import { Vendor } from "../models/vendor.model.js";
import crypto from "crypto";
import { recordAuditLog } from "../utils/auditLogger.js";
import { validateBookingAvailability } from "../services/availability.service.js";

// ==============================
// 🔧 HELPERS
// ==============================

const generateResId = () =>
  `RES${Date.now()}${Math.random().toString(36).substr(2, 5)}`.toUpperCase();

export const generateBookingCode = () => {
  const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `RHC${randomPart}`;
};

// ==============================
// 🚀 CREATE RESERVATION (FIXED)
// ==============================

export const createReservation = async (req, res) => {
  try {
    let {
      resId,
      vendor,
      customerName,
      customerId,
      customerEmail,
      reservationType,
      location,
      totalAmount,
      date,
      time,
      guests,
      checkInDate,
      checkOutDate,
      specialRequest,
      room,
      drinks,
      table,
      combos,
      partPaid,
      payLater,
    } = req.body;

    console.log("Incoming request:", req.body);

    // ✅ FIX 1: Ensure resId always exists
    if (!resId) resId = generateResId();

    // ✅ FIX 2: Validate base fields
    if (!vendor || !customerName || !customerEmail || !reservationType || !location) {
      return res.status(400).json({
        message: "Missing required base fields",
      });
    }

    // ✅ FIX 3: Ensure payment exists
    let payment = await Payment.findOne({ booking: resId });

    if (!payment) {
      payment = await Payment.create({
        vendor,
        booking: resId,
        user: customerId,
        email: customerEmail,
        customerName,
        amount: totalAmount || 0,
        amountPaid: payLater ? 0 : partPaid ? totalAmount / 2 : totalAmount,
        status: payLater ? "pending" : partPaid ? "partly_paid" : "success",
        payLater,
        partPaid,
        booked: !payLater,
        metadata: {
          vendorId: vendor,
          reservationType,
          location,
          date,
          time,
          guests,
          drinks,
          combos,
          room,
          table,
          specialRequest,
        },
      });
    }

    // ✅ FIX 4: Core data
    const bookingCode = generateBookingCode();
    const qrToken = crypto.randomBytes(32).toString("hex");

    const baseData = {
      resId,
      bookingCode,
      paymentRef: payment._id, // 🔥 always exists now
      customerName,
      customerId,
      customerEmail,
      vendor,
      reservationType: `${reservationType}Reservation`,
      reservationStatus: "upcoming",
      location,
      totalAmount,
      paymentStatus: partPaid ? "partly_paid" : payLater ? "not_paid" : "paid",
      payLater,
      partPaid,
      qrConfirmationToken: qrToken,
    };

    let reservation;

    // ==============================
    // 🍽️ RESTAURANT
    // ==============================
    if (reservationType === "restaurant") {
      if (!date || !time || !guests) {
        return res.status(400).json({
          message: "Restaurant requires date, time, guests",
        });
      }

      reservation = await restaurantReservation.create({
        ...baseData,
        date,
        time,
        guests,
      });
    }

    // ==============================
    // 🏨 HOTEL
    // ==============================
    if (reservationType === "hotel") {
      if (!checkInDate || !checkOutDate || !guests || !room) {
        return res.status(400).json({
          message: "Hotel requires checkInDate, checkOutDate, guests, room",
        });
      }

      reservation = await hotelReservation.create({
        ...baseData,
        checkInDate,
        checkOutDate,
        guests,
        room,
        specialRequest,
      });
    }

    // ==============================
    // 🎉 CLUB (MAIN FIX HERE)
    // ==============================
    if (reservationType === "club") {
      if (!date || !time || !guests || !drinks || drinks.length === 0) {
        return res.status(400).json({
          message: "Club requires date, time, guests, drinks",
        });
      }

      reservation = await clubReservation.create({
        ...baseData,
        date,
        time, // 🔥 FIXED
        guests,
        table,
        drinks,
        combos,
      });
    }

    // ==============================
    // 🔔 SOCKET
    // ==============================
    const vendorSocket = getVendorSocket(vendor);
    if (vendorSocket && vendorSocket.readyState === 1) {
      vendorSocket.send(
        JSON.stringify({
          type: "new_reservation",
          data: reservation,
        })
      );
    }

    // ==============================
    // 📧 EMAIL
    // ==============================
    await sendBookingConfirmationEmail(
      customerEmail,
      reservation,
      reservationType
    );

    return res.status(201).json({
      message: "Reservation created successfully",
      data: reservation,
    });
  } catch (error) {
    console.error("Create Reservation Error:", error);
    return res.status(500).json({
      message: error.message,
    });
  }
};

// ==============================
// 💳 PAYMENT → RESERVATION FIX
// ==============================

export async function createReservationFromPayment(payment) {
  const metadata = payment.metadata;

  let resId = payment.booking || generateResId();

  const baseData = {
    resId,
    bookingCode: generateBookingCode(),
    paymentRef: payment._id,
    customerId: payment.user,
    customerName: metadata.customerName,
    customerEmail: metadata.customerEmail,
    vendor: metadata.vendorId,
    location: metadata.location,
    totalAmount: payment.amount,
    reservationType: `${metadata.reservationType}Reservation`,
    qrConfirmationToken: crypto.randomBytes(32).toString("hex"),
  };

  if (!metadata.time) {
    throw new Error("clubReservation validation failed: time is required");
  }

  if (metadata.reservationType === "club") {
    return await clubReservation.create({
      ...baseData,
      date: metadata.date,
      time: metadata.time,
      guests: metadata.guests,
      drinks: metadata.drinks || [],
      combos: metadata.combos || [],
    });
  }

  if (metadata.reservationType === "restaurant") {
    return await restaurantReservation.create({
      ...baseData,
      date: metadata.date,
      time: metadata.time,
      guests: metadata.guests,
    });
  }

  if (metadata.reservationType === "hotel") {
    return await hotelReservation.create({
      ...baseData,
      checkInDate: metadata.checkInDate,
      checkOutDate: metadata.checkOutDate,
      guests: metadata.guests,
      room: metadata.roomId,
    });
  }
}