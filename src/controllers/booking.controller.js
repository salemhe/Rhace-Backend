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

    console.log(req.body);
    if (!vendor || !reservationType || !location || !totalAmount || !resId) {
      return res.status(400).json({ message: "Fill required fields" });
    }

    const payment = await Payment.findOne({ booking: resId });
    if (!payment)
      return res.status(400).json({ message: "Payment Before Booking!" });

    const bookingCode = generateBookingCode();

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
    console.log(query)
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
    console.log(reservations)

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
