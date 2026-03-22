import mongoose from "mongoose";
import {
  Booking,
  clubReservation,
  hotelReservation,
  restaurantReservation,
} from "../models/booking.model.js";
import Payment from "../models/payment.model.js";
import { sendBookingConfirmationEmail } from "../services/mail.service.js";
import { getVendorSocket } from "../websockets/socketManager.js";
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

    // ---------- 1️⃣ TOTAL RESERVATIONS ----------
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

    // ---------- 2️⃣ PREPAID RESERVATIONS ----------
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

    // ---------- 3️⃣ PENDING PAYMENTS ----------
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

    // ---------- 4️⃣ EXPECTED GUESTS ----------
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

    // ---------- 5️⃣ TODAY'S RESERVATIONS (ARRAY) ----------
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

    // ---------- 6️⃣ RESERVATION TRENDS (14 days) ----------
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

    // ---------- 7️⃣ CUSTOMER FREQUENCY ----------
    const customerAgg = await Booking.aggregate([
      { $match: { ...vendorFilter } },
      { $group: { _id: "$customerEmail", count: { $sum: 1 } } },
    ]);

    const returningCustomers = customerAgg.filter((c) => c.count > 1).length;
    const newCustomers = customerAgg.length - returningCustomers;

    const restaurantMenuBreakdown = await restaurantReservation.aggregate([
      { $match: { ...vendorFilter } },
      { $unwind: "$menus" }, // flatten menus array
      { $group: { _id: "$menus.menu", quantity: { $sum: "$menus.quantity" } } },
      {
        $lookup: {
          from: "menuitems", // MongoDB collection name
          localField: "_id",
          foreignField: "_id",
          as: "menuInfo",
        },
      },
      { $unwind: "$menuInfo" },
      { $project: { menuName: "$menuInfo.name", quantity: 1 } },
    ]);

    // Drinks
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

    // Combos
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
          from: "roomtypes", // MongoDB collection name
          localField: "_id",
          foreignField: "_id",
          as: "roomInfo",
        },
      },
      { $unwind: "$roomInfo" },
      { $project: { roomName: "$roomInfo.name", count: 1 } },
    ]);

    // ---------- ✅ FINAL RESPONSE ----------
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
            date: `${t._id.year}-${String(t._id.month).padStart(
              2,
              "0",
            )}-${String(t._id.day).padStart(2, "0")}`,
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

    if (!vendor || !reservationType || !location || !totalAmount || !resId) {
      return res.status(400).json({ message: "Fill required fields" });
    }

    const payment = await Payment.findOne({ booking: resId });
    if (!payment)
      return res.status(400).json({ message: "Payment Before Booking!" });

    // ============================================
    // AVAILABILITY CHECK - Prevent Double Booking
    // ============================================
    const availabilityCheck = await validateBookingAvailability({
      reservationType,
      room,
      table,
      date,
      time,
      checkInDate,
      checkOutDate,
      guests,
      vendor
    });

    if (!availabilityCheck.available) {
      return res.status(409).json({ 
        success: false,
        message: availabilityCheck.reason,
        availability: availabilityCheck
      });
    }
    // ============================================

    const bookingCode = generateBookingCode();
    
    // Generate QR confirmation token for this booking
    const qrConfirmationToken = crypto.randomBytes(32).toString("hex");

    const initialData = {
      resId,
      customerName,
      customerId,
      customerEmail,
      vendor,
      reservationType: reservationType + "Reservation",
      reservationStatus: "Upcoming",
      location,
      totalAmount,
      paymentStatus: partPaid ? "Part Paid" : payLater ? "Pay Later" : "Paid",
      payLater,
      paidFor: true,
      bookingCode,
      qrConfirmationToken,
    };

    let reservationData = {};
    const vendorSocket = getVendorSocket(vendor);

    if (reservationType === "restaurant") {
      if (!image || !date || !time || !guests) {
        return res
          .status(400)
          .json({ message: "Fill restaurants required fields" });
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
            data: {
              ...restaurant,
              message: "You have a new reservation",
            },
          }),
        );
        console.log("Reservation sent to vendor via WebSocket.");
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
          .populate({
            path: "vendor",
          })
          .populate({
            path: "room",
          });
        vendorSocket.send(
          JSON.stringify({
            type: "new_reservation",
            data: {
              ...hotelRes,
              message: "You have a new reservation",
            },
          }),
        );
      }
    }

    if (reservationType === "club") {
      if (!drinks || !date || !time || !guests) {
        return res.status(400).json({ message: "Fill Clubs required fields" });
      }

      const club = await clubReservation.create({
        ...initialData,
        date,
        time,
        table,
        guests,
        drinks,
        combos,
      });

      reservationData = club;

      if (vendorSocket && vendorSocket.readyState === 1) {
        const clubRes = await clubReservation
          .findById(club._id)
          .populate({
            path: "vendor",
          })
          .populate({
            path: "drinks.drink",
          });
        // 1 = OPEN
        vendorSocket.send(
          JSON.stringify({
            type: "new_reservation",
            data: {
              ...clubRes,
              message: "You have a new reservation",
            },
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
      message: "Created Reservation succesfully",
      data: reservationData,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const getReservations = async (req, res) => {
  const {
    vendorId,
    userId,
    bookingId,
    resId,
    limit = 10,
    page = 1,
  } = req.query;
  try {
    const query = {};
    if (!vendorId && !userId && !bookingId && !resId) {
      return res.status(401).json({
        message: "Not Authorized",
      });
    }

    if (bookingId) query._id = bookingId;
    if (vendorId) query.vendor = vendorId;
    if (userId) query.customerId = userId;
    if (resId) query.resId = resId;
    const reservations = await Booking.find(query)
      .populate({ path: "menus.menu" })
      .populate({ path: "vendor" })
      .populate({ path: "room" })
      .populate({ path: "drinks.drink" })
      .populate({ path: "combos" })
      .populate({ path: "table" })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    if (userId) {
      const now = new Date();

      const upcoming = [];
      const past = [];

      for (const resv of reservations) {
        let isUpcoming = false;

        switch (resv.reservationType) {
          case "restaurantReservation":
          case "clubReservation":
            if (resv.date && new Date(resv.date) >= now) {
              isUpcoming = true;
            }
            break;

          case "hotelReservation":
            if (resv.checkOutDate && new Date(resv.checkOutDate) >= now) {
              isUpcoming = true;
            }
            break;

          default:
            // fallback on status
            if (resv.reservationStatus === "Upcoming") {
              isUpcoming = true;
            }
            break;
        }

        if (isUpcoming) upcoming.push(resv);
        else past.push(resv);
      }

      return res.status(200).json({
        message: "Fetched Reservations Successfully",
        data: {
          upcoming,
          past,
        },
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
    return res.status(500).json({
      message: error.message,
    });
  }
};

// @desc    Create a multi-room hotel reservation
// @route   POST /api/bookings/create-multi-room
// @access  Private
export const createMultiRoomReservation = async (req, res) => {
  try {
    const {
      vendor,
      customerName,
      customerId,
      customerEmail,
      location,
      checkInDate,
      checkOutDate,
      guests,
      rooms,
      specialRequest,
      partPaid,
      payLater,
    } = req.body;

    // Validate required fields
    if (!vendor || !location || !checkInDate || !checkOutDate || !rooms || rooms.length === 0) {
      return res.status(400).json({ 
        message: "Fill required fields: vendor, location, checkInDate, checkOutDate, and at least one room" 
      });
    }

    // Validate each room in the array
    for (const roomItem of rooms) {
      if (!roomItem.roomType || !roomItem.quantity || !roomItem.pricePerNight) {
        return res.status(400).json({ 
          message: "Each room must have roomType, quantity, and pricePerNight" 
        });
      }
    }

    // Calculate number of nights
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

    if (nights < 1) {
      return res.status(400).json({ 
        message: "Check-out date must be after check-in date" 
      });
    }

    // Calculate total amount
    let totalAmount = 0;
    let totalRooms = 0;
    for (const roomItem of rooms) {
      totalAmount += roomItem.pricePerNight * roomItem.quantity * nights;
      totalRooms += roomItem.quantity;
    }

    const bookingCode = generateBookingCode();

    const initialData = {
      customerName,
      customerId,
      customerEmail,
      vendor,
      reservationType: "hotelReservation",
      reservationStatus: "Upcoming",
      location,
      totalAmount,
      paymentStatus: partPaid ? "Part Paid" : !payLater ? "Paid" : "Not Paid",
      payLater,
      paidFor: true,
      bookingCode,
    };

    // Create multi-room hotel reservation
    const hotel = await hotelReservation.create({
      ...initialData,
      checkInDate,
      checkOutDate,
      guests,
      rooms,
      specialRequest,
      totalRooms,
    });

    // Send notification via WebSocket
    const vendorSocket = getVendorSocket(vendor);
    if (vendorSocket && vendorSocket.readyState === 1) {
      const hotelRes = await hotelReservation
        .findById(hotel._id)
        .populate({
          path: "vendor",
        })
        .populate({
          path: "rooms.roomType",
        });
      
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

    // Populate the result
    const reservation = await hotelReservation.findById(hotel._id)
      .populate("vendor", "businessName vendorType")
      .populate("rooms.roomType", "name pricePerNight");

    // Send confirmation email
    await sendBookingConfirmationEmail(
      customerEmail,
      reservation,
      "hotel",
    );

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
        rooms: rooms.map(r => ({
          roomType: r.roomType,
          quantity: r.quantity,
          pricePerNight: r.pricePerNight,
          subtotal: r.pricePerNight * r.quantity * nights
        }))
      }
    });
  } catch (error) {
    console.error("Error creating multi-room reservation:", error);
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const getReservationStats = async (req, res) => {
  try {
    const vendorId = req.user._id || null; // optional filter
    const vendorFilter = vendorId ? { vendor: vendorId } : {};

    const today = new Date();
    const { start: todayStart, end: todayEnd } = getDateRange(today);
    const { start: lastWeekStart, end: lastWeekEnd } = getDateRange(
      dayjs(today).subtract(7, "day"),
    );

    // 1. Total Reservations Today vs Last Week
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

    // 2. Prepaid Reservations
    const [todayPrepaid, lastWeekPrepaid] = await Promise.all([
      Booking.countDocuments({
        ...vendorFilter,
        paymentStatus: "success",
        createdAt: { $gte: todayStart, $lte: todayEnd },
      }),
      Booking.countDocuments({
        ...vendorFilter,
        paymentStatus: "success",
        createdAt: { $gte: lastWeekStart, $lte: lastWeekEnd },
      }),
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

    // 4. Pending Payments
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

    res.status(200).json({
      success: true,
      data: {
        totalReservations: {
          count: todayCount,
          change: totalReservationsChange,
        },
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

export async function createReservationFromPayment(payment) {
  const metadata = payment.metadata;
  const bookingCode = generateBookingCode();
  
  // Generate QR confirmation token for this booking
  const qrConfirmationToken = crypto.randomBytes(32).toString("hex");

  const baseData = {
    resId: payment.booking,
    bookingCode,
    paymentRef: payment._id,
    customerId: payment.user,
    customerName: metadata.customerName,
    customerEmail: metadata.customerEmail,
    customerPhone: metadata.customerPhone,
    vendor: metadata.vendorId,
    location: metadata.location,
    totalAmount: payment.amount,
    paymentStatus: payment.payLater ? "not_paid" : payment.partPaid ? "partly_paid" : "paid",
    reservationStatus: "upcoming",
    payLater: payment.payLater,
    partPaid: payment.partPaid,
    reservationType: metadata.reservationType + "Reservation",
    qrConfirmationToken,
  };

  let reservation;
  if (metadata.reservationType === "restaurant") {
    reservation = await restaurantReservation.create(
      [
        {
          ...baseData,
          date: metadata.date,
          time: metadata.time,
          guests: metadata.guests,
          mealPreselected: metadata.mealPreselected,
          menus:
            metadata.menus?.map((m) => ({
              menu: m.menuId,
              quantity: m.quantity,
              specialRequest: m.specialRequest,
            })) || [],
          specialOccasion: metadata.specialOccasion,
          seatingPreference: metadata.seatingPreference,
          specialRequest: metadata.specialRequest,
        },
      ],
    );

    reservation = reservation[0];
  }

  if (metadata.reservationType === "hotel") {
    reservation = await hotelReservation.create(
      [
        {
          ...baseData,
          checkInDate: metadata.checkInDate,
          checkOutDate: metadata.checkOutDate,
          guests: metadata.guests,
          room: metadata.roomId,
          specialRequest: metadata.specialRequest,
        },
      ],
    );

    reservation = reservation[0];
  }

  if (metadata.reservationType === "club") {
    reservation = await clubReservation.create(
      [
        {
          ...baseData,
          date: metadata.date,
          time: metadata.time,
          guests: metadata.guests,
          table: metadata.table,
          drinks:
            metadata.drinks?.map((d) => ({
              drink: d.drink,
              quantity: d.quantity,
            })) || [],
          combos: metadata.combos || [],
          specialRequest: metadata.specialRequest,
        },
      ],
    );

    reservation = reservation[0];
  }

  return reservation;
}

export async function completePayment(req, res) {
  const { trxref } = req.body;

  try {
    const payment = await Payment.findById(trxref);

    if (!payment) {
      return res.status(404).json({
        message: "Payment not found",
      });
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
        payment: {
          status: payment.status,
          paid_at: payment.paidAt,
          amount: payment.amount,
        },
        reservation,
        isNewBooking: false,
        source: "webhook",
      });
    }

    const paystackVerification = await axios.get(
      `https://api.paystack.co/transaction/verify/${payment._id}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      },
    );

    const paystackData = paystackVerification.data.data;

    if (paystackData.status !== "success") {
      return res.status(400).json({
        message: "Payment not successful",
      });
    }

    let reservation = await Booking.findOne({
      resId: payment.booking,
    })

    let isNewBooking = false;

    if (!reservation) {
      reservation = await createReservationFromPayment(payment);
      const vendor = await Vendor.findOne({ _id: reservation.vendor._id });
      if (payment.isSplitPayment && !payment.booked) {vendor.balance += payment.amountPaid }
      await vendor.save();
      isNewBooking = true;
    }

    await Payment.updateOne(
      { _id: trxref },
      {
        status: "success",
        booked: true,
        paidAt: paystackData.paid_at,
        reservationId: reservation._id,
        paystackData,
        paymentMethod: paystackData.channel,
      },
    );

    const populate = reservation.reservationType === "restaurantReservation" ?
     "menus.menu" : reservation.reservationType === "hotelReservation" ?
     "room" : "drinks.drink combos table";

    
    await reservation.populate(`vendor ${populate}`);
    
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
            data: {
              ...reservation.toObject(),
              message: "You have a new reservation",
            },
          }),
        );
      }
    }
    
    res.json({
      success: true,
      payment: {
        status: "success",
        paid_at: paystackData.paid_at,
        amount: payment.amount,
      },
      reservation,
      isNewBooking,
      source: "redirect",
    });
  } catch (error) {
    console.error("Complete payment error:", error);

    res.status(400).json({
      message: error.message || "Failed to complete payment",
    });
  }
}

// ============================================
// RESERVATION CONFIRMATION SYSTEM
// ============================================

// @desc    Generate QR confirmation token for a booking
// @route   POST /api/bookings/:id/generate-qr-token
// @access  Private (Vendor, Admin)
export const generateQRConfirmationToken = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Generate unique confirmation token
    const token = crypto.randomBytes(32).toString("hex");

    // Update booking with QR token
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

// @desc    Verify QR code before confirmation (for vendor scanning preview)
// @route   GET /api/bookings/verify-qr/:token
// @access  Private (Vendor, Admin)
export const verifyQRCode = async (req, res) => {
  try {
    const { token } = req.params;

    const booking = await Booking.findOne({ qrConfirmationToken: token })
      .populate("vendor", "businessName vendorType")
      .populate("customerId", "firstName lastName email phone");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Invalid QR code",
        valid: false,
      });
    }

    // Check if already confirmed
    const isConfirmed = !!booking.confirmedAt;

    // Get reservation time based on type
    let reservationTime = null;
    let isPast = false;

    if (booking.reservationType === "restaurantReservation" || booking.reservationType === "clubReservation") {
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
        canConfirm: !isConfirmed, // Can confirm if not already confirmed
      },
    });
  } catch (error) {
    console.error("Error verifying QR code:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Manual confirmation by vendor from dashboard
// @route   POST /api/bookings/:id/confirm
// @access  Private (Vendor, Admin)
export const confirmReservation = async (req, res) => {
  try {
    const { id } = req.params;
    const { vendorId } = req.body; // Vendor confirming the reservation

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Check if already confirmed
    if (booking.confirmedAt) {
      return res.status(400).json({
        message: "Reservation already confirmed",
        confirmedAt: booking.confirmedAt,
        confirmedBy: booking.confirmedBy,
        confirmationMethod: booking.confirmationMethod,
      });
    }

    // Verify vendor owns this booking (if vendor is confirming)
    if (vendorId && booking.vendor.toString() !== vendorId) {
      // Admin can confirm any booking
      const userRole = req.user?.role;
      if (userRole !== "superadmin" && userRole !== "admin") {
        return res.status(403).json({ message: "Not authorized to confirm this reservation" });
      }
    }

    // Update confirmation
    booking.confirmedAt = new Date();
    booking.confirmedBy = vendorId || req.user?._id;
    booking.confirmationMethod = "manual";
    await booking.save();

    // Record audit log
    await recordAuditLog(
      vendorId || req.user?._id,
      "RESERVATION_CONFIRMED",
      "Booking",
      booking._id,
      {
        confirmedBy: vendorId || req.user?._id,
        confirmationMethod: "manual",
        previousStatus: booking.reservationStatus,
      }
    );

    // Emit real-time update
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

    res.status(200).json({
      success: true,
      message: "Reservation confirmed successfully",
      data: {
        bookingId: booking._id,
        bookingCode: booking.bookingCode,
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

// @desc    QR code confirmation - vendor scans user's QR code
// @route   POST /api/bookings/confirm-by-qr
// @access  Private (Vendor, Admin)
export const confirmByQRCode = async (req, res) => {
  try {
    const { token, vendorId } = req.body;

    if (!token) {
      return res.status(400).json({ message: "QR token is required" });
    }

    const booking = await Booking.findOne({ qrConfirmationToken: token });

    if (!booking) {
      return res.status(404).json({ message: "Invalid QR code - booking not found" });
    }

    // Check if already confirmed
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

    // Verify vendor owns this booking (if vendor is confirming)
    if (vendorId && booking.vendor.toString() !== vendorId) {
      const userRole = req.user?.role;
      if (userRole !== "superadmin" && userRole !== "admin") {
        return res.status(403).json({ message: "Not authorized to confirm this reservation" });
      }
    }

    // Update confirmation via QR
    booking.confirmedAt = new Date();
    booking.confirmedBy = vendorId || req.user?._id;
    booking.confirmationMethod = "qr_code";
    await booking.save();

    // Record audit log
    await recordAuditLog(
      vendorId || req.user?._id,
      "RESERVATION_CONFIRMED_VIA_QR",
      "Booking",
      booking._id,
      {
        confirmedBy: vendorId || req.user?._id,
        confirmationMethod: "qr_code",
        previousStatus: booking.reservationStatus,
      }
    );

    // Emit real-time update
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

// @desc    Create a multi-table club reservation
// @route   POST /api/bookings/create-multi-table
// @access  Private
export const createMultiTableReservation = async (req, res) => {
  try {
    const {
      vendor,
      customerName,
      customerId,
      customerEmail,
      location,
      date,
      time,
      guests,
      tables,
      drinks,
      combos,
      specialRequest,
      partPaid,
      payLater,
    } = req.body;

    // Validate required fields
    if (!vendor || !location || !date || !time || !tables || tables.length === 0) {
      return res.status(400).json({ 
        message: "Fill required fields: vendor, location, date, time, and at least one table" 
      });
    }

    // Validate each table in the array
    for (const tableItem of tables) {
      if (!tableItem.tableType || !tableItem.quantity || !tableItem.pricePerTable) {
        return res.status(400).json({ 
          message: "Each table must have tableType, quantity, and pricePerTable" 
        });
      }
    }

    // Calculate total amount
    let totalAmount = 0;
    let totalTables = 0;
    for (const tableItem of tables) {
      totalAmount += tableItem.pricePerTable * tableItem.quantity;
      totalTables += tableItem.quantity;
    }

    const bookingCode = generateBookingCode();
    const qrConfirmationToken = crypto.randomBytes(32).toString("hex");

    const initialData = {
      customerName,
      customerId,
      customerEmail,
      vendor,
      reservationType: "clubReservation",
      reservationStatus: "Upcoming",
      location,
      totalAmount,
      paymentStatus: partPaid ? "Part Paid" : !payLater ? "Paid" : "Not Paid",
      payLater,
      paidFor: true,
      bookingCode,
      qrConfirmationToken,
    };

    // Create multi-table club reservation
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

    // Send notification via WebSocket
    const vendorSocket = getVendorSocket(vendor);
    if (vendorSocket && vendorSocket.readyState === 1) {
      const clubRes = await clubReservation
        .findById(club._id)
        .populate({
          path: "vendor",
        })
        .populate({
          path: "tables.tableType",
        })
        .populate({
          path: "drinks.drink",
        });
      
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

    // Populate the result
    const reservation = await clubReservation.findById(club._id)
      .populate("vendor", "businessName vendorType")
      .populate("tables.tableType", "name price")
      .populate("drinks.drink", "name price")
      .populate("combos");

    // Send confirmation email
    await sendBookingConfirmationEmail(
      customerEmail,
      reservation,
      "club",
    );

    return res.status(201).json({
      message: "Created Multi-Table Reservation successfully",
      data: reservation,
      bookingDetails: {
        bookingCode,
        date,
        time,
        totalTables,
        totalAmount,
        tables: tables.map(t => ({
          tableType: t.tableType,
          quantity: t.quantity,
          pricePerTable: t.pricePerTable,
          subtotal: t.pricePerTable * t.quantity
        }))
      }
    });
  } catch (error) {
    console.error("Error creating multi-table reservation:", error);
    return res.status(500).json({
      message: error.message,
    });
  }
};

// @desc    Get confirmation status for a booking
// @route   GET /api/bookings/:id/confirmation-status
// @access  Private
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
