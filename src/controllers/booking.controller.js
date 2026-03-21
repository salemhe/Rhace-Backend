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

const getDateRange = (date) => ({
  start: dayjs(date).startOf("day").toDate(),
  end: dayjs(date).endOf("day").toDate(),
});

const percentChange = (current, prev) => {
  if (prev === 0 && current > 0) return 100;
  if (prev === 0 && current === 0) return 0;
  return Number((((current - prev) / prev) * 100).toFixed(2));
};

export const generateBookingCode = () => {
  const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `RHC${randomPart}`;
};

// ---------- Controller ----------
export const getBookingSummary = async (req, res) => {
  try {
    const vendorId = req.user._id || null;
    const vendorFilter = vendorId ? { vendor: vendorId } : {};

    const today = new Date();
    const { start: todayStart, end: todayEnd } = getDateRange(today);
    const { start: lastWeekStart, end: lastWeekEnd } = getDateRange(
      dayjs(today).subtract(7, "day"),
    );

    const [todayCount, lastWeekCount] = await Promise.all([
      Booking.countDocuments({
        ...vendorFilter,
        createdAt: { $gte: todayStart, $lte: todayEnd },
      }),
      Booking.countDocuments({
        ...vendorFilter,
        createdAt: { $gte: lastWeekStart, $lte: lastWeekEnd },
      }),
    ]);
    const totalReservationsChange = percentChange(todayCount, lastWeekCount);

    const [todayPrepaid, lastWeekPrepaid] = await Promise.all([
      Booking.countDocuments({
        ...vendorFilter,
        paymentStatus: "paid",
        createdAt: { $gte: todayStart, $lte: todayEnd },
      }),
      Booking.countDocuments({
        ...vendorFilter,
        paymentStatus: "paid",
        createdAt: { $gte: lastWeekStart, $lte: lastWeekEnd },
      }),
    ]);
    const prepaidChange = percentChange(todayPrepaid, lastWeekPrepaid);

    const [todayPending, lastWeekPending] = await Promise.all([
      Booking.countDocuments({
        ...vendorFilter,
        paymentStatus: "pending",
        createdAt: { $gte: todayStart, $lte: todayEnd },
      }),
      Booking.countDocuments({
        ...vendorFilter,
        paymentStatus: "pending",
        createdAt: { $gte: lastWeekStart, $lte: lastWeekEnd },
      }),
    ]);
    const pendingChange = percentChange(todayPending, lastWeekPending);

    const guestAggregation = async (start, end) => {
      const result = await Booking.aggregate([
        {
          $match: {
            ...vendorFilter,
            $or: [
              { date: { $gte: start, $lte: end } },
              { checkInDate: { $gte: start, $lte: end } },
              { createdAt: { $gte: start, $lte: end } },
            ],
          },
        },
        {
          $group: {
            _id: null,
            guests: { $sum: { $ifNull: ["$guests", 0] } },
          },
        },
      ]);
      return result[0]?.guests || 0;
    };

    const [guestsToday, guestsLastWeek] = await Promise.all([
      guestAggregation(todayStart, todayEnd),
      guestAggregation(lastWeekStart, lastWeekEnd),
    ]);
    const guestsChange = percentChange(guestsToday, guestsLastWeek);

    const todaysReservations = await Booking.find({
      ...vendorFilter,
      $or: [
        { date: { $gte: todayStart, $lte: todayEnd } },
        { checkInDate: { $gte: todayStart, $lte: todayEnd } },
        { createdAt: { $gte: todayStart, $lte: todayEnd } },
      ],
    })
      .populate("customerId", "name email")
      .populate("vendor", "name")
      .sort({ createdAt: -1 })
      .lean();

    const fourteenDaysAgo = dayjs().subtract(13, "day").startOf("day").toDate();

    const trends = await Booking.aggregate([
      {
        $match: {
          ...vendorFilter,
          createdAt: { $gte: fourteenDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            day: { $dayOfMonth: "$createdAt" },
            month: { $month: "$createdAt" },
            year: { $year: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    const last7Days = trends.slice(-7).reduce((acc, d) => acc + d.count, 0);
    const prev7Days = trends.slice(0, -7).reduce((acc, d) => acc + d.count, 0);
    const trendChange = percentChange(last7Days, prev7Days);

    const customerAgg = await Booking.aggregate([
      { $match: { ...vendorFilter } },
      { $group: { _id: "$customerEmail", count: { $sum: 1 } } },
    ]);

    const returningCustomers = customerAgg.filter((c) => c.count > 1).length;
    const newCustomers = customerAgg.length - returningCustomers;

    const restaurantMenuBreakdown = await restaurantReservation.aggregate([
      { $match: { ...vendorFilter } },
      { $unwind: "$menus" },
      { $group: { _id: "$menus.menu", quantity: { $sum: "$menus.quantity" } } },
      {
        $lookup: {
          from: "menuitems",
          localField: "_id",
          foreignField: "_id",
          as: "menuInfo",
        },
      },
      { $unwind: "$menuInfo" },
      { $project: { menuName: "$menuInfo.name", quantity: 1 } },
    ]);

    const clubDrinksBreakdown = await clubReservation.aggregate([
      { $match: { ...vendorFilter } },
      { $unwind: "$drinks" },
      {
        $group: {
          _id: "$drinks.drink",
          quantity: { $sum: "$drinks.quantity" },
        },
      },
      {
        $lookup: {
          from: "drinks",
          localField: "_id",
          foreignField: "_id",
          as: "drinkInfo",
        },
      },
      { $unwind: "$drinkInfo" },
      { $project: { drinkName: "$drinkInfo.name", quantity: 1 } },
    ]);

    const clubCombosBreakdown = await clubReservation.aggregate([
      { $match: { ...vendorFilter } },
      { $unwind: "$combos" },
      { $group: { _id: "$combos", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "bottlesets",
          localField: "_id",
          foreignField: "_id",
          as: "comboInfo",
        },
      },
      { $unwind: "$comboInfo" },
      { $project: { comboName: "$comboInfo.name", count: 1 } },
    ]);

    const hotelRoomsBreakdown = await hotelReservation.aggregate([
      { $match: { ...vendorFilter } },
      { $group: { _id: "$room", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "roomtypes",
          localField: "_id",
          foreignField: "_id",
          as: "roomInfo",
        },
      },
      { $unwind: "$roomInfo" },
      { $project: { roomName: "$roomInfo.name", count: 1 } },
    ]);

    res.status(200).json({
      success: true,
      vendorScope: vendorId || "all",
      data: {
        todayStats: [
          { details: todayCount, change: totalReservationsChange },
          { details: todayPrepaid, change: prepaidChange },
          { details: guestsToday, change: guestsChange },
          { details: todayPending, change: pendingChange },
        ],
        todaysReservations,
        hotelRoomsBreakdown,
        restaurantMenuBreakdown,
        clubDrinksBreakdown,
        clubCombosBreakdown,
        reservationTrends: {
          daily: trends.map((t) => ({
            date: `${t._id.year}-${String(t._id.month).padStart(2, "0")}-${String(t._id.day).padStart(2, "0")}`,
            count: t.count,
          })),
          last7Days,
          prev7Days,
          trendChange,
        },
        customerFrequency: {
          new: newCustomers,
          returning: returningCustomers,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching vendor summary:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching booking summary",
      error: error.message,
    });
  }
};

export const createReservation = async (req, res) => {
  try {
    const {
      resId,
      vendor,
      customerName,
      customerId,
      customerEmail,
      reservationType,
      location,
      totalAmount,
      image,
      date,
      time,
      guests,
      mealPreselected,
      menus,
      specialOccasion,
      seatingPreference,
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

    console.log("Received body:", req.body);

    // Validate required base fields
    const requiredBaseFields = [
      "resId", "vendor", "customerName", "customerId",
      "customerEmail", "reservationType", "location", "totalAmount",
    ];
    const missingBase = requiredBaseFields.filter((field) => !req.body[field]);
    if (missingBase.length > 0) {
      return res.status(400).json({
        message: `Missing required base fields: ${missingBase.join(", ")}`,
        required: requiredBaseFields,
      });
    }

    // Club-specific validation
    if (reservationType === "club") {
      const clubRequired = ["date", "time", "guests", "drinks"];
      const missingClub = clubRequired.filter((field) => !req.body[field]);
      if (missingClub.length > 0) {
        return res.status(400).json({
          message: `Missing required club fields: ${missingClub.join(", ")}`,
          required: clubRequired,
        });
      }

      // FIX: drinks must be a non-empty array
      if (!Array.isArray(drinks) || drinks.length === 0) {
        return res.status(400).json({
          message: "drinks must be a non-empty array of { drink, quantity }",
        });
      }
    }

    // FIX: Look up payment by resId (the booking reference)
    const payment = await Payment.findOne({ booking: resId });
    if (!payment) {
      return res.status(400).json({
        message: `Payment not found for booking: ${resId}. Create a payment with { booking: "${resId}" } first.`,
        hint: "Ensure payment document has a 'booking' field matching this resId",
      });
    }

    // Availability check
    const availabilityCheck = await validateBookingAvailability({
      reservationType,
      room,
      table,
      date,
      time,
      checkInDate,
      checkOutDate,
      guests,
      vendor,
    });

    if (!availabilityCheck.available) {
      return res.status(409).json({
        success: false,
        message: availabilityCheck.reason,
        availability: availabilityCheck,
      });
    }

    const bookingCode = generateBookingCode();
    const qrConfirmationToken = crypto.randomBytes(32).toString("hex");

    // FIX: paymentRef is now always set from the found payment document
    const initialData = {
      resId,
      bookingCode,
      paymentRef: payment._id,           // ✅ always resolved from DB
      customerName,
      customerId,
      customerEmail,
      vendor,
      reservationType: reservationType + "Reservation",
      reservationStatus: "upcoming",
      location,
      totalAmount,
      paymentStatus: partPaid ? "Part Paid" : payLater ? "Pay Later" : "Paid",
      payLater,
      partPaid,
      qrConfirmationToken,
    };

    let reservationData = {};
    const vendorSocket = getVendorSocket(vendor);

    if (reservationType === "restaurant") {
      if (!image || !date || !time || !guests) {
        return res.status(400).json({ message: "Fill restaurants required fields" });
      }

      const restaurant = await restaurantReservation.create({
        ...initialData,
        date,
        time,
        guests,
        mealPreselected,
        menus,
        specialOccasion,
        seatingPreference,
        specialRequest,
      });

      reservationData = restaurant;

      if (vendorSocket && vendorSocket.readyState === 1) {
        vendorSocket.send(
          JSON.stringify({
            type: "new_reservation",
            data: { ...restaurant, message: "You have a new reservation" },
          }),
        );
      }
    }

    if (reservationType === "hotel") {
      if (!checkInDate || !checkOutDate || !guests || !room) {
        return res.status(400).json({ message: "Fill hotels required fields" });
      }

      const hotel = await hotelReservation.create({
        ...initialData,
        checkInDate,
        checkOutDate,
        guests,
        specialRequest,
        room,
      });

      reservationData = hotel;

      if (vendorSocket && vendorSocket.readyState === 1) {
        const hotelRes = await hotelReservation
          .findById(hotel._id)
          .populate({ path: "vendor" })
          .populate({ path: "room" });
        vendorSocket.send(
          JSON.stringify({
            type: "new_reservation",
            data: { ...hotelRes.toObject(), message: "You have a new reservation" },
          }),
        );
      }
    }

    if (reservationType === "club") {
      const club = await clubReservation.create({
        ...initialData,
        date,
        time,
        table,
        guests,
        drinks,
        combos,
        specialRequest,
      });

      reservationData = club;

      if (vendorSocket && vendorSocket.readyState === 1) {
        const clubRes = await clubReservation
          .findById(club._id)
          .populate({ path: "vendor" })
          .populate({ path: "drinks.drink" });
        vendorSocket.send(
          JSON.stringify({
            type: "new_reservation",
            data: { ...clubRes.toObject(), message: "You have a new reservation" },
          }),
        );
      }
    }

    const reservation = await Booking.findOne({ bookingCode })
      .populate({ path: "menus.menu" })
      .populate({ path: "vendor" })
      .populate({ path: "room" })
      .populate({ path: "drinks.drink" })
      .populate({ path: "combos" });

    await sendBookingConfirmationEmail(
      reservation.customerEmail,
      reservation,
      reservationType,
    );

    return res.status(201).json({
      message: "Created Reservation successfully",
      data: reservationData,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
};

export const getReservations = async (req, res) => {
  const { vendorId, userId, bookingId, resId, limit = 10, page = 1 } = req.query;
  try {
    const query = {};
    if (!vendorId && !userId && !bookingId && !resId) {
      return res.status(401).json({ message: "Not Authorized" });
    }

    if (bookingId) query._id = bookingId;
    if (vendorId) query.vendor = vendorId;
    if (userId) query.customerId = userId;
    if (resId) query.resId = resId;

    const reservations = await Booking.find(query)
      .populate({ path: "menus.menu" })
      .populate({ path: "vendor" })
      .populate({ path: "paymentRef" })
      .populate({ path: "room" })
      .populate({ path: "drinks.drink" })
      .populate({ path: "combos" })
      .populate({ path: "table" })
      .populate({ path: "rooms.roomType" })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    if (resId && reservations.length === 1) {
      const booking = reservations[0];
      let rooms = [];

      if (booking.reservationType === "hotelReservation") {
        if (booking.rooms && booking.rooms.length > 0) {
          const numRooms = booking.rooms.length;
          const guestsPerRoom = Math.floor((booking.guests || 1) / numRooms) || 1;
          rooms = booking.rooms.map((room) => ({
            roomId: room.roomType?._id?.toString() || room.roomType,
            checkInDate: booking.checkInDate,
            checkOutDate: booking.checkOutDate,
            guests: guestsPerRoom,
          }));
        } else if (booking.room) {
          rooms = [{
            roomId: booking.room._id?.toString() || booking.room,
            checkInDate: booking.checkInDate,
            checkOutDate: booking.checkOutDate,
            guests: booking.guests || 1,
          }];
        }
      }

      const transformed = {
        vendorId: booking.vendor?._id?.toString(),
        reservationType: booking.reservationType.replace("Reservation", ""),
        location: booking.location,
        resId: booking.resId,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        amount: booking.totalAmount || 0,
        partPaid: booking.partPaid || false,
        rooms,
      };

      return res.status(200).json({
        message: "Fetched Reservation Successfully",
        data: transformed,
      });
    }

    if (userId) {
      const now = new Date();
      const upcoming = [];
      const past = [];

      for (const resv of reservations) {
        let isUpcoming = false;

        switch (resv.reservationType) {
          case "restaurantReservation":
          case "clubReservation":
            if (resv.date && new Date(resv.date) >= now) isUpcoming = true;
            break;
          case "hotelReservation":
            if (resv.checkOutDate && new Date(resv.checkOutDate) >= now) isUpcoming = true;
            break;
          default:
            if (resv.reservationStatus === "upcoming") isUpcoming = true;
            break;
        }

        if (isUpcoming) upcoming.push(resv);
        else past.push(resv);
      }

      return res.status(200).json({
        message: "Fetched Reservations Successfully",
        data: { upcoming, past },
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
      });
    }

    return res.status(200).json({
      message: "Fetched Reservations Successfully",
      data: reservations,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
};

export const createMultiRoomReservation = async (req, res) => {
  try {
    const {
      vendor, customerName, customerId, customerEmail,
      location, checkInDate, checkOutDate, guests,
      rooms, specialRequest, partPaid, payLater,
    } = req.body;

    if (!vendor || !location || !checkInDate || !checkOutDate || !rooms || rooms.length === 0) {
      return res.status(400).json({
        message: "Fill required fields: vendor, location, checkInDate, checkOutDate, and at least one room",
      });
    }

    for (const roomItem of rooms) {
      if (!roomItem.roomType || !roomItem.quantity || !roomItem.pricePerNight) {
        return res.status(400).json({
          message: "Each room must have roomType, quantity, and pricePerNight",
        });
      }
    }

    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

    if (nights < 1) {
      return res.status(400).json({ message: "Check-out date must be after check-in date" });
    }

    let totalAmount = 0;
    let totalRooms = 0;
    for (const roomItem of rooms) {
      totalAmount += roomItem.pricePerNight * roomItem.quantity * nights;
      totalRooms += roomItem.quantity;
    }

    // FIX: multi-room reservation also needs resId and paymentRef
    const resId = `RES${Date.now()}${Math.random().toString(36).substr(2, 9)}`.toUpperCase();

    const payment = await Payment.create({
      vendor,
      booking: resId,
      user: customerId,
      email: customerEmail,
      customerName,
      amount: totalAmount,
      amountPaid: payLater ? 0 : partPaid ? totalAmount / 2 : totalAmount,
      status: payLater ? "pending" : partPaid ? "partly_paid" : "success",
      payLater,
      partPaid,
      booked: !payLater,
      metadata: {
        vendorId: vendor,
        reservationType: "hotel",
        location,
        checkInDate,
        checkOutDate,
        guests,
        rooms,
        specialRequest,
      },
    });

    const bookingCode = generateBookingCode();

    const initialData = {
      resId,
      bookingCode,
      paymentRef: payment._id,           // ✅ always set
      customerName,
      customerId,
      customerEmail,
      vendor,
      reservationType: "hotelReservation",
      reservationStatus: "upcoming",
      location,
      totalAmount,
      paymentStatus: partPaid ? "partly_paid" : payLater ? "not_paid" : "paid",
      payLater,
    };

    const hotel = await hotelReservation.create({
      ...initialData,
      checkInDate,
      checkOutDate,
      guests,
      rooms,
      specialRequest,
      totalRooms,
    });

    const vendorSocket = getVendorSocket(vendor);
    if (vendorSocket && vendorSocket.readyState === 1) {
      const hotelRes = await hotelReservation
        .findById(hotel._id)
        .populate({ path: "vendor" })
        .populate({ path: "rooms.roomType" });

      vendorSocket.send(
        JSON.stringify({
          type: "new_multi_room_reservation",
          data: {
            ...hotelRes.toObject(),
            message: `You have a new multi-room booking for ${totalRooms} rooms`,
          },
        }),
      );
    }

    const reservation = await hotelReservation
      .findById(hotel._id)
      .populate("vendor", "businessName vendorType")
      .populate("rooms.roomType", "name pricePerNight");

    await sendBookingConfirmationEmail(customerEmail, reservation, "hotel");

    return res.status(201).json({
      message: "Created Multi-Room Reservation successfully",
      data: reservation,
      bookingDetails: {
        bookingCode,
        checkInDate,
        checkOutDate,
        nights,
        totalRooms,
        totalAmount,
        rooms: rooms.map((r) => ({
          roomType: r.roomType,
          quantity: r.quantity,
          pricePerNight: r.pricePerNight,
          subtotal: r.pricePerNight * r.quantity * nights,
        })),
      },
    });
  } catch (error) {
    console.error("Error creating multi-room reservation:", error);
    return res.status(500).json({ message: error.message });
  }
};

export const getReservationStats = async (req, res) => {
  try {
    const vendorId = req.user._id || null;
    const vendorFilter = vendorId ? { vendor: vendorId } : {};

    const today = new Date();
    const { start: todayStart, end: todayEnd } = getDateRange(today);
    const { start: lastWeekStart, end: lastWeekEnd } = getDateRange(
      dayjs(today).subtract(7, "day"),
    );

    const [todayCount, lastWeekCount] = await Promise.all([
      Booking.countDocuments({ ...vendorFilter, createdAt: { $gte: todayStart, $lte: todayEnd } }),
      Booking.countDocuments({ ...vendorFilter, createdAt: { $gte: lastWeekStart, $lte: lastWeekEnd } }),
    ]);
    const totalReservationsChange = percentChange(todayCount, lastWeekCount);

    const [todayPrepaid, lastWeekPrepaid] = await Promise.all([
      Booking.countDocuments({ ...vendorFilter, paymentStatus: "paid", createdAt: { $gte: todayStart, $lte: todayEnd } }),
      Booking.countDocuments({ ...vendorFilter, paymentStatus: "paid", createdAt: { $gte: lastWeekStart, $lte: lastWeekEnd } }),
    ]);
    const prepaidChange = percentChange(todayPrepaid, lastWeekPrepaid);

    const guestAggregation = async (start, end) => {
      const result = await Booking.aggregate([
        {
          $match: {
            ...vendorFilter,
            $or: [
              { date: { $gte: start, $lte: end } },
              { checkInDate: { $gte: start, $lte: end } },
              { createdAt: { $gte: start, $lte: end } },
            ],
          },
        },
        { $group: { _id: null, guests: { $sum: { $ifNull: ["$guests", 0] } } } },
      ]);
      return result[0]?.guests || 0;
    };

    const [guestsToday, guestsLastWeek] = await Promise.all([
      guestAggregation(todayStart, todayEnd),
      guestAggregation(lastWeekStart, lastWeekEnd),
    ]);
    const guestsChange = percentChange(guestsToday, guestsLastWeek);

    const [todayPending, lastWeekPending] = await Promise.all([
      Booking.countDocuments({ ...vendorFilter, paymentStatus: "pending", createdAt: { $gte: todayStart, $lte: todayEnd } }),
      Booking.countDocuments({ ...vendorFilter, paymentStatus: "pending", createdAt: { $gte: lastWeekStart, $lte: lastWeekEnd } }),
    ]);
    const pendingChange = percentChange(todayPending, lastWeekPending);

    res.status(200).json({
      success: true,
      data: {
        totalReservations: { count: todayCount, change: totalReservationsChange },
        prepaidReservations: { count: todayPrepaid, change: prepaidChange },
        expectedGuests: { count: guestsToday, change: guestsChange },
        pendingPayments: { count: todayPending, change: pendingChange },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching reservation stats",
      error: error.message,
    });
  }
};

// FIX: createReservationFromPayment — all 3 required fields now guaranteed
export async function createReservationFromPayment(payment) {
  const metadata = payment.metadata;

  // FIX 1: resId comes from payment.booking (the booking reference ID)
  const resId = payment.booking;
  if (!resId) {
    throw new Error("Payment is missing 'booking' field (resId). Cannot create reservation.");
  }

  // FIX 2: paymentRef is always payment._id — no longer conditional
  const paymentRef = payment._id;

  const bookingCode = generateBookingCode();
  const qrConfirmationToken = crypto.randomBytes(32).toString("hex");

  // FIX 3: normalise reservationType — strip any trailing "Reservation" then re-append
  const rawType = (metadata.reservationType || "").replace(/Reservation$/i, "").toLowerCase();
  const reservationType = rawType.charAt(0).toUpperCase() + rawType.slice(1) + "Reservation";

  const baseData = {
    resId,                                // ✅ from payment.booking
    bookingCode,
    paymentRef,                           // ✅ always payment._id
    customerId: payment.user,
    customerName: metadata.customerName,
    customerEmail: metadata.customerEmail,
    customerPhone: metadata.customerPhone,
    vendor: metadata.vendorId,
    location: metadata.location,
    totalAmount: payment.amount,
    paymentStatus: payment.payLater ? "not_paid" : payment.partPaid ? "partly_paid" : "paid",
    reservationStatus: payment.payLater ? "upcoming" : "confirmed",
    payLater: payment.payLater,
    partPaid: payment.partPaid,
    reservationType,
    qrConfirmationToken,
  };

  // FIX 4: validate club metadata ONCE, before branching
  const isClubType = ["club", "clubreservation"].includes(rawType);

  if (isClubType) {
    if (
      !metadata.date ||
      !metadata.time ||
      !metadata.guests ||
      !Array.isArray(metadata.drinks) ||
      metadata.drinks.length === 0
    ) {
      throw new Error(
        "Club reservation requires metadata fields: date, time, guests, drinks (non-empty array)"
      );
    }
  }

  let reservation;

  if (rawType === "restaurant") {
    const [created] = await restaurantReservation.create([{
      ...baseData,
      date: metadata.date,
      time: metadata.time,
      guests: metadata.guests,
      mealPreselected: metadata.mealPreselected,
      menus: metadata.menus?.map((m) => ({
        menu: m.menuId,
        quantity: m.quantity,
        specialRequest: m.specialRequest,
      })) || [],
      specialOccasion: metadata.specialOccasion,
      seatingPreference: metadata.seatingPreference,
      specialRequest: metadata.specialRequest,
    }]);
    reservation = created;
  }

  if (rawType === "hotel") {
    const [created] = await hotelReservation.create([{
      ...baseData,
      checkInDate: metadata.checkInDate,
      checkOutDate: metadata.checkOutDate,
      guests: metadata.guests,
      room: metadata.roomId,
      specialRequest: metadata.specialRequest,
    }]);
    reservation = created;
  }

  if (isClubType) {
    const [created] = await clubReservation.create([{
      ...baseData,
      date: metadata.date,
      time: metadata.time,
      guests: metadata.guests,
      table: metadata.table,
      drinks: metadata.drinks.map((d) => ({
        drink: d.drink,
        quantity: d.quantity,
      })),
      combos: metadata.combos || [],
      specialRequest: metadata.specialRequest,
    }]);
    reservation = created;
  }

  if (!reservation) {
    throw new Error(`Unknown reservationType: "${metadata.reservationType}"`);
  }

  return reservation;
}

export async function completePayment(req, res) {
  const { trxref } = req.body;

  try {
    const payment = await Payment.findById(trxref);

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    if (payment.webhookProcessed && payment.booked) {
      const reservation = await Booking.findById(payment.reservationId)
        .populate("vendor")
        .populate("menus.menu")
        .populate("room")
        .populate("drinks.drink")
        .populate("table")
        .populate("combos");

      return res.json({
        success: true,
        payment: { status: payment.status, paid_at: payment.paidAt, amount: payment.amount },
        reservation,
        isNewBooking: false,
        source: "webhook",
      });
    }

    const paystackVerification = await axios.get(
      `https://api.paystack.co/transaction/verify/${payment._id}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } },
    );

    const paystackData = paystackVerification.data.data;

    if (paystackData.status !== "success") {
      return res.status(400).json({ message: "Payment not successful" });
    }

    let reservation = await Booking.findOne({ resId: payment.booking });
    let isNewBooking = false;

    if (!reservation) {
      reservation = await createReservationFromPayment(payment);
      const vendor = await Vendor.findOne({ _id: reservation.vendor._id });
      if (payment.isSplitPayment && !payment.booked) {
        vendor.balance += payment.amountPaid;
      }
      await vendor.save();
      isNewBooking = true;
    }

    await Payment.updateOne(
      { _id: trxref },
      {
        status: "success",
        booked: true,
        webhookProcessed: true,
        paidAt: paystackData.paid_at,
        reservationId: reservation._id,
        paystackData,
        paymentMethod: paystackData.channel,
      },
    );

    const populate =
      reservation.reservationType === "restaurantReservation"
        ? "menus.menu"
        : reservation.reservationType === "hotelReservation"
        ? "room"
        : "drinks.drink combos table";

    await reservation.populate(`vendor ${populate}`);

    // AUTO-CONFIRM: Full payment bookings (non-payLater)
    if (!reservation.confirmedAt && !payment.payLater && payment.status === 'success') {
      reservation.reservationStatus = "confirmed";
      reservation.confirmedAt = new Date();
      reservation.confirmedBy = reservation.vendor._id;
      reservation.confirmationMethod = "auto_payment";
      await reservation.save();
      console.log('🤖 AUTO-CONFIRMED booking:', reservation._id, 'Full payment detected');
    }

    if (isNewBooking) {
      sendBookingConfirmationEmail(
        reservation.customerEmail,
        reservation,
        payment.metadata.reservationType,
      ).catch((err) => console.error("Email failed:", err));

      const vendorSocket = getVendorSocket(reservation.vendor._id);
      if (vendorSocket && vendorSocket.readyState === 1) {
        vendorSocket.send(
          JSON.stringify({
            type: "new_reservation",
            data: { ...reservation.toObject(), message: "You have a new reservation" },
          }),
        );
      }
    }

    res.json({
      success: true,
      payment: { status: "success", paid_at: paystackData.paid_at, amount: payment.amount },
      reservation,
      isNewBooking,
      source: "redirect",
    });
  } catch (error) {
    console.error("Complete payment error:", error);
    res.status(400).json({ message: error.message || "Failed to complete payment" });
  }
}

export const generateQRConfirmationToken = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    booking.qrConfirmationToken = token;
    await booking.save();

    res.status(200).json({
      success: true,
      message: "QR confirmation token generated",
      data: {
        bookingId: booking._id,
        bookingCode: booking.bookingCode,
        qrToken: token,
        qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
          `https://www.rhace.co/confirm/${booking._id}?token=${token}`
        )}&size=200x200`,
      },
    });
  } catch (error) {
    console.error("Error generating QR token:", error);
    res.status(500).json({ message: error.message });
  }
};

export const verifyQRCode = async (req, res) => {
  try {
    const { token } = req.params;

    const booking = await Booking.findOne({ qrConfirmationToken: token })
      .populate("vendor", "businessName vendorType")
      .populate("customerId", "firstName lastName email phone");

    if (!booking) {
      return res.status(404).json({ success: false, message: "Invalid QR code", valid: false });
    }

    const isConfirmed = !!booking.confirmedAt;

    let reservationTime = null;
    let isPast = false;

    if (
      booking.reservationType === "restaurantReservation" ||
      booking.reservationType === "clubReservation"
    ) {
      reservationTime = booking.date;
      isPast = new Date(booking.date) < new Date();
    } else if (booking.reservationType === "hotelReservation") {
      reservationTime = booking.checkInDate;
      isPast = new Date(booking.checkInDate) < new Date();
    }

    res.status(200).json({
      success: true,
      valid: true,
      data: {
        bookingId: booking._id,
        bookingCode: booking.bookingCode,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        vendor: booking.vendor,
        reservationType: booking.reservationType,
        reservationTime,
        status: booking.reservationStatus,
        isConfirmed,
        isPast,
        canConfirm: !isConfirmed,
      },
    });
  } catch (error) {
    console.error("Error verifying QR code:", error);
    res.status(500).json({ message: error.message });
  }
};

export const confirmReservation = async (req, res) => {
  try {
    const { id } = req.params;
    const { vendorId } = req.body;
    const effectiveVendorId = vendorId || req.user?._id;

    const booking = await Booking.findById(id).populate({
      path: 'paymentRef',
      model: 'Payment'
    }).populate('vendor');
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    console.log('📋 Booking details:', {
      _id: booking._id,
      resId: booking.resId,
      type: booking.reservationType,
      status: booking.reservationStatus,
      paymentRef: booking.paymentRef?._id,
      vendor: booking.vendor?._id
    });

    let payment = booking.paymentRef;
    console.log('💳 Payment lookup #1 (from booking.paymentRef):', payment?._id || 'MISSING');

    if (!payment) {
      if (booking.resId) {
        payment = await Payment.findOne({ booking: booking.resId });
        console.log('💳 Fallback #1 (by resId):', payment?._id || 'NOT FOUND');
      }
      
      if (!payment && booking._id) {
        payment = await Payment.findOne({ booking: booking._id.toString() });
        console.log('💳 Fallback #2 (by booking ID):', payment?._id || 'NOT FOUND');
      }
    }
    
    if (!payment) {
      return res.status(400).json({
        success: false,
        message: 'No payment found for this booking. Check payments collection.',
        bookingId: booking._id,
        bookingResId: booking.resId,
        debug: [
          `db.payments.find({ $or: [{booking: "${booking.resId || 'MISSING'}"}, {booking: ObjectId("${booking._id}")}] })`
        ]
      });
    }





    // Validate payment exists & successful
    const isPaymentValid = payment.status === 'success' && 
                          payment.amountPaid >= (payment.amount * 0.95);

    if (!isPaymentValid) {
      console.log('🚫 Payment validation failed:', {
        bookingId: id,
        resId: effectiveResId,
        paymentId: payment?._id,
        paymentStatus: payment?.status,
        amountDue: payment?.amount,
        amountPaid: payment?.amountPaid,
        isSuccessStatus: payment?.status === 'success',
        isFullyPaid: payment?.amountPaid >= payment?.amount,
        rawPayment: payment
      });
      
      return res.status(400).json({
        success: false,
        message: `Payment validation failed for booking ${effectiveResId}. Expected status="success". Current: "${payment?.status || 'MISSING'}"`,
        paymentStatus: payment?.status || 'MISSING',
        paymentId: payment?._id,
        amountDue: payment?.amount || 0,
        amountPaid: payment?.amountPaid || 0,
        bookingPaymentRef: booking.paymentRef?._id,
        effectiveResId,
        debug: '1. Check if payment exists: db.payments.findOne({booking: "' + effectiveResId + '"})',
        fix: '2. Set status: db.payments.updateOne({_id: ObjectId("PAYMENT_ID")}, {$set: {status: "success"}})\n3. Add to booking: db.reservations.updateOne({_id: ObjectId("' + id + '")}, {$set: {paymentRef: ObjectId("PAYMENT_ID")}})'
      });
    }

    console.log('✅ Payment validation passed:', {paymentId: payment._id, status: payment.status});

    if (booking.confirmedAt) {
      return res.status(400).json({
        message: "Reservation already confirmed",
        confirmedAt: booking.confirmedAt,
        confirmedBy: booking.confirmedBy,
        confirmationMethod: booking.confirmationMethod,
      });
    }

    if (booking.vendor.toString() !== effectiveVendorId) {
      const userRole = req.user?.role;
      if (userRole !== "superadmin" && userRole !== "admin") {
        return res.status(403).json({ message: "Not authorized to confirm this reservation" });
      }
    }

    booking.confirmedAt = new Date();
    booking.confirmedBy = vendorId || req.user?._id;
    booking.confirmationMethod = "manual";
    booking.reservationStatus = "confirmed";
    await booking.save();

    await recordAuditLog(effectiveVendorId, "RESERVATION_CONFIRMED", "Booking", booking._id, {
      confirmedBy: effectiveVendorId,
      confirmationMethod: "manual",
      previousStatus: booking.reservationStatus,
      effectiveResId,
      effectivePaymentId
    });

    const vendorSocket = getVendorSocket(booking.vendor);
    if (vendorSocket && vendorSocket.readyState === 1) {
      vendorSocket.send(
        JSON.stringify({
          type: "reservation_confirmed",
          data: {
            bookingId: booking._id,
            bookingCode: booking.bookingCode,
            customerName: booking.customerName,
            confirmedAt: booking.confirmedAt,
            message: "Reservation confirmed successfully",
          },
        })
      );
    }

    const userSocket = getUserSocket(booking.customerId.toString());
    if (userSocket && userSocket.readyState === 1) {
      userSocket.send(
        JSON.stringify({
          type: "reservation_confirmed",
          data: {
            bookingId: booking._id,
            bookingCode: booking.bookingCode,
            customerName: booking.customerName,
            confirmedAt: booking.confirmedAt,
            confirmationMethod: booking.confirmationMethod,
            message: "Your reservation has been confirmed by the vendor!",
          },
        })
      );
    }

    try {
      const vendorType = booking.reservationType?.replace("Reservation", "").toLowerCase() || "booking";
      await sendBookingConfirmationEmail(booking.customerEmail, booking, vendorType);
    } catch (emailError) {
      console.error("Email notification failed:", emailError);
    }

    res.status(200).json({
      success: true,
      message: "Hotel reservation confirmed successfully",
      data: {
        bookingId: booking._id,
        bookingCode: booking.bookingCode,
        resId: effectiveResId,
        paymentId: effectivePaymentId,
        confirmedAt: booking.confirmedAt,
        confirmedBy: booking.confirmedBy,
        confirmationMethod: booking.confirmationMethod,
      },
    });
  } catch (error) {
    console.error("Error confirming reservation:", error);
    res.status(500).json({ message: error.message });
  }
};

export const confirmByQRCode = async (req, res) => {
  try {
    const { token, vendorId: bodyVendorId } = req.body;
    const vendorId = bodyVendorId || req.user._id;

    if (!token) {
      return res.status(400).json({ message: "QR token is required" });
    }

    const booking = await Booking.findOne({ qrConfirmationToken: token });

    if (!booking) {
      return res.status(404).json({ message: "Invalid QR code - booking not found" });
    }

    if (booking.confirmedAt) {
      return res.status(400).json({
        success: false,
        message: "Reservation already confirmed",
        data: {
          bookingId: booking._id,
          bookingCode: booking.bookingCode,
          confirmedAt: booking.confirmedAt,
          confirmedBy: booking.confirmedBy,
          confirmationMethod: booking.confirmationMethod,
        },
      });
    }

    if (vendorId && booking.vendor.toString() !== vendorId) {
      const userRole = req.user?.role;
      if (userRole !== "superadmin" && userRole !== "admin") {
        return res.status(403).json({ message: "Not authorized to confirm this reservation" });
      }
    }

    booking.confirmedAt = new Date();
    booking.confirmedBy = vendorId || req.user?._id;
    booking.confirmationMethod = "qr_code";
    booking.reservationStatus = "confirmed";
    await booking.save();

    await recordAuditLog(vendorId || req.user?._id, "RESERVATION_CONFIRMED_VIA_QR", "Booking", booking._id, {
      confirmedBy: vendorId || req.user?._id,
      confirmationMethod: "qr_code",
      previousStatus: booking.reservationStatus,
    });

    const vendorSocket = getVendorSocket(booking.vendor);
    if (vendorSocket && vendorSocket.readyState === 1) {
      vendorSocket.send(
        JSON.stringify({
          type: "reservation_confirmed",
          data: {
            bookingId: booking._id,
            bookingCode: booking.bookingCode,
            customerName: booking.customerName,
            confirmedAt: booking.confirmedAt,
            confirmationMethod: "qr_code",
            message: "Reservation confirmed via QR code",
          },
        })
      );
    }

    const userSocket = getUserSocket(booking.customerId.toString());
    if (userSocket && userSocket.readyState === 1) {
      userSocket.send(
        JSON.stringify({
          type: "reservation_confirmed",
          data: {
            bookingId: booking._id,
            bookingCode: booking.bookingCode,
            customerName: booking.customerName,
            confirmedAt: booking.confirmedAt,
            confirmationMethod: booking.confirmationMethod,
            message: "Your reservation has been confirmed by the vendor via QR code!",
          },
        })
      );
    }

    try {
      const vendorType = booking.reservationType?.replace("Reservation", "").toLowerCase() || "booking";
      await sendBookingConfirmationEmail(booking.customerEmail, booking, vendorType);
    } catch (emailError) {
      console.error("QR confirmation email failed:", emailError);
    }

    res.status(200).json({
      success: true,
      message: "Reservation confirmed successfully via QR code",
      data: {
        bookingId: booking._id,
        bookingCode: booking.bookingCode,
        customerName: booking.customerName,
        confirmedAt: booking.confirmedAt,
        confirmedBy: booking.confirmedBy,
        confirmationMethod: booking.confirmationMethod,
      },
    });
  } catch (error) {
    console.error("Error confirming via QR code:", error);
    res.status(500).json({ message: error.message });
  }
};

export const createMultiTableReservation = async (req, res) => {
  try {
    const {
      vendor, customerName, customerId, customerEmail,
      location, date, time, guests, tables,
      drinks, combos, specialRequest, partPaid, payLater,
      resId: bodyResId, paymentRef: bodyPaymentRef,
    } = req.body;

    if (!vendor || !location || !date || !time || !tables || tables.length === 0) {
      const missing = [];
      if (!vendor) missing.push("vendor");
      if (!location) missing.push("location");
      if (!date) missing.push("date");
      if (!time) missing.push("time");
      if (!tables || tables.length === 0) missing.push("tables");
      return res.status(400).json({ message: `Missing required fields: ${missing.join(", ")}` });
    }

    for (const tableItem of tables) {
      if (!tableItem.tableType || !tableItem.quantity || !tableItem.pricePerTable) {
        return res.status(400).json({
          message: "Each table must have tableType, quantity, and pricePerTable",
        });
      }
    }

    let totalAmount = 0;
    let totalTables = 0;
    for (const tableItem of tables) {
      totalAmount += tableItem.pricePerTable * tableItem.quantity;
      totalTables += tableItem.quantity;
    }

    const generateUniqueResId = async () => {
      let candidate = `RES${Date.now()}${Math.random().toString(36).substr(2, 9)}`.toUpperCase();
      while (
        (await Payment.findOne({ booking: candidate })) ||
        (await Booking.findOne({ resId: candidate }))
      ) {
        candidate = `RES${Date.now()}${Math.random().toString(36).substr(2, 9)}`.toUpperCase();
      }
      return candidate;
    };

    let effectiveResId = bodyResId;
    let effectivePaymentRef = bodyPaymentRef;

    if (!effectiveResId && effectivePaymentRef) {
      const pem = await Payment.findById(effectivePaymentRef);
      if (pem) effectiveResId = pem.booking;
    }

    if (!effectiveResId) {
      effectiveResId = await generateUniqueResId();
    }

    if (!effectivePaymentRef) {
      const existingPayment = await Payment.findOne({ booking: effectiveResId });
      if (existingPayment) {
        effectivePaymentRef = existingPayment._id;
      }
    }

    // FIX: auto-create payment if still missing
    if (!effectivePaymentRef) {
      const createdPayment = await Payment.create({
        vendor,
        booking: effectiveResId,
        user: customerId || req.user._id,
        email: customerEmail,
        customerName,
        amount: totalAmount,
        amountPaid: payLater ? 0 : partPaid ? totalAmount / 2 : totalAmount,
        status: payLater ? "pending" : partPaid ? "partly_paid" : "success",
        payLater,
        partPaid,
        booked: !payLater,
        metadata: {
          vendorId: vendor,
          reservationType: "club",
          location,
          date,
          time,
          guests,
          drinks,
          combos,
          table: tables,
          specialRequest,
        },
      });
      effectivePaymentRef = createdPayment._id;
    }

    const bookingCode = generateBookingCode();
    const qrConfirmationToken = crypto.randomBytes(32).toString("hex");

    const initialData = {
      resId: effectiveResId,
      bookingCode,
      paymentRef: effectivePaymentRef,   // ✅ always set
      customerName,
      customerId,
      customerEmail,
      vendor,
      reservationType: "clubReservation",
      reservationStatus: "upcoming",
      location,
      totalAmount,
      paymentStatus: partPaid ? "partly_paid" : payLater ? "not_paid" : "paid",
      payLater,
      qrConfirmationToken,
    };

    const club = await clubReservation.create({
      ...initialData,
      date,
      time,
      tables,
      guests,
      drinks,
      combos,
      specialRequest,
      totalTables,
    });

    const vendorSocket = getVendorSocket(vendor);
    if (vendorSocket && vendorSocket.readyState === 1) {
      const clubRes = await clubReservation
        .findById(club._id)
        .populate({ path: "vendor" })
        .populate({ path: "tables.tableType" })
        .populate({ path: "drinks.drink" });

      vendorSocket.send(
        JSON.stringify({
          type: "new_multi_table_reservation",
          data: {
            ...clubRes.toObject(),
            message: `You have a new multi-table booking for ${totalTables} tables`,
          },
        }),
      );
    }

    const reservation = await clubReservation
      .findById(club._id)
      .populate("vendor", "businessName vendorType")
      .populate("tables.tableType", "name price")
      .populate("drinks.drink", "name price")
      .populate("combos");

    await sendBookingConfirmationEmail(customerEmail, reservation, "club");

    return res.status(201).json({
      message: "Created Multi-Table Reservation successfully",
      data: reservation,
      bookingDetails: {
        bookingCode,
        date,
        time,
        totalTables,
        totalAmount,
        tables: tables.map((t) => ({
          tableType: t.tableType,
          quantity: t.quantity,
          pricePerTable: t.pricePerTable,
          subtotal: t.pricePerTable * t.quantity,
        })),
      },
    });
  } catch (error) {
    console.error("Error creating multi-table reservation:", error);
    return res.status(500).json({ message: error.message });
  }
};

export const getConfirmationStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id)
      .populate("vendor", "businessName vendorType")
      .populate("confirmedBy", "businessName");

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    res.status(200).json({
      success: true,
      data: {
        bookingId: booking._id,
        bookingCode: booking.bookingCode,
        isConfirmed: !!booking.confirmedAt,
        confirmedAt: booking.confirmedAt,
        confirmedBy: booking.confirmedBy,
        confirmationMethod: booking.confirmationMethod,
        vendor: booking.vendor,
      },
    });
  } catch (error) {
    console.error("Error getting confirmation status:", error);
    res.status(500).json({ message: error.message });
  }
};
