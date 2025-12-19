import { Booking } from "../models/booking.model.js";
import PaymentTransaction from "../models/paymenttransaction.model.js";
import Payment from "../models/payment.model.js";
import Hotel from "../models/hotel.model.js";
import RoomType from "../models/roomtype.model.js";
import { Vendor } from "../models/vendor.model.js";
import Reservation from "../models/reservation.model.js";

// Emit real-time updates
const emitDashboardUpdate = (userId, data) => {
  if (global.io) {
    global.io.to(`dashboard_${userId}`).emit('dashboard_update', data);
  }
};

// @desc    Get dashboard KPIs
// @route   GET /api/dashboard/kpis
// @access  Private (Admin only)
export const getKPIs = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    // For admin, get all hotels, clubs, restaurants
    const hotels = await Hotel.find();
    const hotelIds = hotels.map(h => h._id);

    const clubs = await Vendor.find({ vendorType: "club" });
    const clubIds = clubs.map(c => c._id);

    const restaurants = await Vendor.find({ vendorType: "restaurant" });
    const restaurantIds = restaurants.map(r => r._id);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const lastWeek = new Date(today);
    lastWeek.setDate(today.getDate() - 7);
    const twoWeeksAgo = new Date(today);
    twoWeeksAgo.setDate(today.getDate() - 14);

    // Total Bookings (hotels)
    const totalHotelBookings = await Booking.countDocuments({ hotel: { $in: hotelIds } });

    // Total Reservations (clubs + restaurants)
    const totalReservations = await Reservation.countDocuments({ vendor: { $in: [...clubIds, ...restaurantIds] } });

    // Total Bookings/Reservations combined
    const totalBookings = totalHotelBookings + totalReservations;

    // Reservations made today (hotels)
    const hotelReservationsToday = await Booking.countDocuments({
      hotel: { $in: hotelIds },
      createdAt: { $gte: today, $lt: tomorrow },
    });

    // Reservations made today (clubs + restaurants)
    const vendorReservationsToday = await Reservation.countDocuments({
      vendor: { $in: [...clubIds, ...restaurantIds] },
      createdAt: { $gte: today, $lt: tomorrow },
    });

    const reservationsToday = hotelReservationsToday + vendorReservationsToday;

    // Confirmed Bookings (upcoming or completed for hotels)
    const confirmedBookings = await Booking.countDocuments({
      hotel: { $in: hotelIds },
      status: { $in: ["upcoming", "completed"] }
    });

    // Confirmed Reservations (confirmed for vendors)
    const confirmedReservations = await Reservation.countDocuments({
      vendor: { $in: [...clubIds, ...restaurantIds] },
      reservation_status: "Confirmed"
    });

    // Total Bookings Last Week (hotels)
    const totalHotelBookingsLastWeek = await Booking.countDocuments({
      hotel: { $in: hotelIds },
      createdAt: { $gte: lastWeek, $lt: today },
    });

    // Total Reservations Last Week
    const totalReservationsLastWeek = await Reservation.countDocuments({
      vendor: { $in: [...clubIds, ...restaurantIds] },
      createdAt: { $gte: lastWeek, $lt: today },
    });

    const totalBookingsLastWeek = totalHotelBookingsLastWeek + totalReservationsLastWeek;

    // Total Bookings Two Weeks Ago (for delta calculation)
    const totalHotelBookingsTwoWeeksAgo = await Booking.countDocuments({
      hotel: { $in: hotelIds },
      createdAt: { $gte: twoWeeksAgo, $lt: lastWeek },
    });

    const totalReservationsTwoWeeksAgo = await Reservation.countDocuments({
      vendor: { $in: [...clubIds, ...restaurantIds] },
      createdAt: { $gte: twoWeeksAgo, $lt: lastWeek },
    });

    const totalBookingsTwoWeeksAgo = totalHotelBookingsTwoWeeksAgo + totalReservationsTwoWeeksAgo;

    // Total Revenue from hotels
    const hotelRevenueAgg = await PaymentTransaction.aggregate([
      { $lookup: { from: "bookings", localField: "booking", foreignField: "_id", as: "booking" } },
      { $unwind: "$booking" },
      { $match: { "booking.hotel": { $in: hotelIds }, status: "succeeded" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const hotelRevenue = hotelRevenueAgg.length > 0 ? hotelRevenueAgg[0].total : 0;

    // Total Revenue from reservations (assuming deposit or payment amount)
    const reservationRevenueAgg = await Reservation.aggregate([
      { $match: { vendor: { $in: [...clubIds, ...restaurantIds] }, payment_status: "Paid" } },
      { $group: { _id: null, total: { $sum: "$deposit" } } } // Assuming deposit is the revenue
    ]);
    const reservationRevenue = reservationRevenueAgg.length > 0 ? reservationRevenueAgg[0].total : 0;

    const totalRevenue = hotelRevenue + reservationRevenue;

    // Total Revenue Last Week
    const hotelRevenueLastWeekAgg = await PaymentTransaction.aggregate([
      { $lookup: { from: "bookings", localField: "booking", foreignField: "_id", as: "booking" } },
      { $unwind: "$booking" },
      { $match: { "booking.hotel": { $in: hotelIds }, status: "succeeded", createdAt: { $gte: lastWeek, $lt: today } } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const hotelRevenueLastWeek = hotelRevenueLastWeekAgg.length > 0 ? hotelRevenueLastWeekAgg[0].total : 0;

    const reservationRevenueLastWeekAgg = await Reservation.aggregate([
      { $match: { vendor: { $in: [...clubIds, ...restaurantIds] }, payment_status: "Paid", createdAt: { $gte: lastWeek, $lt: today } } },
      { $group: { _id: null, total: { $sum: "$deposit" } } }
    ]);
    const reservationRevenueLastWeek = reservationRevenueLastWeekAgg.length > 0 ? reservationRevenueLastWeekAgg[0].total : 0;

    const revenueLastWeek = hotelRevenueLastWeek + reservationRevenueLastWeek;

    // Total Revenue Two Weeks Ago (for delta calculation)
    const hotelRevenueTwoWeeksAgoAgg = await PaymentTransaction.aggregate([
      { $lookup: { from: "bookings", localField: "booking", foreignField: "_id", as: "booking" } },
      { $unwind: "$booking" },
      { $match: { "booking.hotel": { $in: hotelIds }, status: "succeeded", createdAt: { $gte: twoWeeksAgo, $lt: lastWeek } } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const hotelRevenueTwoWeeksAgo = hotelRevenueTwoWeeksAgoAgg.length > 0 ? hotelRevenueTwoWeeksAgoAgg[0].total : 0;

    const reservationRevenueTwoWeeksAgoAgg = await Reservation.aggregate([
      { $match: { vendor: { $in: [...clubIds, ...restaurantIds] }, payment_status: "Paid", createdAt: { $gte: twoWeeksAgo, $lt: lastWeek } } },
      { $group: { _id: null, total: { $sum: "$deposit" } } }
    ]);
    const reservationRevenueTwoWeeksAgo = reservationRevenueTwoWeeksAgoAgg.length > 0 ? reservationRevenueTwoWeeksAgoAgg[0].total : 0;

    const revenueTwoWeeksAgo = hotelRevenueTwoWeeksAgo + reservationRevenueTwoWeeksAgo;

    // Pending Payments from hotels
    const hotelPendingPaymentsAgg = await PaymentTransaction.aggregate([
      { $lookup: { from: "bookings", localField: "booking", foreignField: "_id", as: "booking" } },
      { $unwind: "$booking" },
      { $match: { "booking.hotel": { $in: hotelIds }, status: "pending" } },
      { $count: "count" }
    ]);
    const hotelPendingPayments = hotelPendingPaymentsAgg.length > 0 ? hotelPendingPaymentsAgg[0].count : 0;

    // Pending Payments from reservations
    const reservationPendingPayments = await Reservation.countDocuments({
      vendor: { $in: [...clubIds, ...restaurantIds] },
      payment_status: "Pending"
    });

    const pendingPayments = hotelPendingPayments + reservationPendingPayments;

    // Occupancy Rate (simplified: based on total bookings vs total rooms for hotels only)
    const totalRooms = await RoomType.aggregate([
      { $match: { hotelId: { $in: hotelIds } } },
      { $group: { _id: null, total: { $sum: "$totalUnits" } } }
    ]);
    const rooms = totalRooms.length > 0 ? totalRooms[0].total : 1;
    const occupancyRate = (confirmedBookings / (rooms * 30)) * 100; // Assuming 30 days

    // Calculate deltas
    const bookingsDelta = totalBookingsLastWeek - totalBookingsTwoWeeksAgo;
    const revenueDelta = revenueLastWeek - revenueTwoWeeksAgo;

    const kpiData = {
      totalBookings,
      reservationsToday,
      confirmedBookings: confirmedBookings + confirmedReservations,
      totalRevenue,
      pendingPayments,
      occupancyRate: Math.min(occupancyRate, 100), // Cap at 100%
      bookingsDelta,
      revenueDelta,
    };

    // Emit real-time update
    emitDashboardUpdate(req.user._id, kpiData);

    res.status(200).json(kpiData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get reservations commencing banner (upcoming bookings starting soon)
// @route   GET /api/dashboard/upcoming-reservations
// @access  Private (Admin only)
export const getUpcomingReservations = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    // For admin, get all hotels
    const hotels = await Hotel.find();
    const hotelIds = hotels.map(h => h._id);

    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);

    const upcoming = await Booking.find({
      hotel: { $in: hotelIds },
      checkInDate: { $gte: today, $lte: nextWeek },
      status: "upcoming"
    }).populate("guest", "name email").populate("hotel", "name").limit(10);

    res.status(200).json(upcoming);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get today's reservations with countdown
// @route   GET /api/dashboard/todays-reservations
// @access  Private (Admin only)
export const getTodaysReservations = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    // For admin, get all hotels
    const hotels = await Hotel.find();
    const hotelIds = hotels.map(h => h._id);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todaysBookings = await Booking.find({
      hotel: { $in: hotelIds },
      checkInDate: { $gte: today, $lt: tomorrow },
      status: "upcoming"
    }).populate("guest", "name email").populate("hotel", "name");

    // Add countdown to each booking
    const now = new Date();
    const bookingsWithCountdown = todaysBookings.map(booking => {
      const checkInTime = new Date(booking.checkInDate);
      const timeDiff = checkInTime - now;
      const hours = Math.floor(timeDiff / (1000 * 60 * 60));
      const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
      return {
        ...booking.toObject(),
        countdown: {
          hours: Math.max(0, hours),
          minutes: Math.max(0, minutes),
          totalMinutes: Math.max(0, Math.floor(timeDiff / (1000 * 60))),
        },
      };
    });

    res.status(200).json(bookingsWithCountdown);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get booking trends chart data
// @route   GET /api/dashboard/booking-trends
// @access  Private (Admin only)
export const getBookingTrends = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    // For admin, get all hotels
    const hotels = await Hotel.find();
    const hotelIds = hotels.map(h => h._id);

    // Group bookings by month
    const trends = await Booking.aggregate([
      { $match: { hotel: { $in: hotelIds } } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    res.status(200).json(trends);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get revenue trends chart data
// @route   GET /api/dashboard/revenue-trends
// @access  Private (Admin only)
export const getRevenueTrends = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    // For admin, get all hotels
    const hotels = await Hotel.find();
    const hotelIds = hotels.map(h => h._id);

    // Group payments by month
    const trends = await PaymentTransaction.aggregate([
      { $lookup: { from: "bookings", localField: "booking", foreignField: "_id", as: "booking" } },
      { $unwind: "$booking" },
      { $match: { "booking.hotel": { $in: hotelIds }, status: "succeeded" } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          total: { $sum: "$amount" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    res.status(200).json(trends);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get customer frequency chart data (new vs returning guests)
// @route   GET /api/dashboard/customer-frequency
// @access  Private
export const getCustomerFrequency = async (req, res) => {
  try {
    const userId = req.user._id;
    const hotels = await Hotel.find({ createdBy: userId });
    const hotelIds = hotels.map(h => h._id);

    // Aggregate bookings grouped by guest and count bookings per guest
    const guestBookingCounts = await Booking.aggregate([
      { $match: { hotel: { $in: hotelIds } } },
      {
        $group: {
          _id: "$guest",
          bookingCount: { $sum: 1 }
        }
      }
    ]);

    // Count new guests (bookingCount == 1) and returning guests (bookingCount > 1)
    const newGuestsCount = guestBookingCounts.filter(g => g.bookingCount === 1).length;
    const returningGuestsCount = guestBookingCounts.filter(g => g.bookingCount > 1).length;

    res.status(200).json({
      newGuests: newGuestsCount,
      returningGuests: returningGuestsCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get revenue by menu category chart data
// @route   GET /api/dashboard/revenue-by-category
// @access  Private
export const getRevenueByCategory = async (req, res) => {
  try {
    const userId = req.user._id;
    const hotels = await Hotel.find({ createdBy: userId });
    const hotelIds = hotels.map(h => h._id);

    // Lookup bookings for these hotels
    const bookings = await Booking.find({ hotel: { $in: hotelIds } }).populate({
      path: "mealSelections.menuItem",
      select: "category price"
    });

    // Aggregate revenue by menu category
    const revenueByCategory = {};

    bookings.forEach(booking => {
      booking.mealSelections.forEach(selection => {
        const category = selection.menuItem?.category || "Uncategorized";
        const price = selection.menuItem?.price || 0;
        const quantity = selection.quantity || 1;
        revenueByCategory[category] = (revenueByCategory[category] || 0) + price * quantity;
      });
    });

    res.status(200).json(revenueByCategory);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get reservation source chart data
// @route   GET /api/dashboard/reservation-sources
// @access  Private
export const getReservationSources = async (req, res) => {
  try {
    const userId = req.user._id;
    const hotels = await Hotel.find({ createdBy: userId });
    const hotelIds = hotels.map(h => h._id);

    // Assuming Booking model has a 'source' field (e.g., 'walk-in', 'online', 'phone')
    // If not present, this needs to be added to the model and booking creation flow
    const sourcesAggregation = await Booking.aggregate([
      { $match: { hotel: { $in: hotelIds } } },
      {
        $group: {
          _id: "$source",
          count: { $sum: 1 }
        }
      }
    ]);

    const sources = {};
    sourcesAggregation.forEach(item => {
      sources[item._id || "Unknown"] = item.count;
    });

    res.status(200).json(sources);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get top performing vendors
// @route   GET /api/dashboard/top-vendors
// @access  Private
export const getTopVendors = async (req, res) => {
  try {
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const nextMonth = new Date(currentMonth);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    // Aggregate vendor performance metrics based on reservations
    const topVendors = await Reservation.aggregate([
      {
        $match: {
          createdAt: { $gte: currentMonth, $lt: nextMonth },
          status: { $in: ["confirmed", "seated"] },
        },
      },
      {
        $group: {
          _id: "$vendor",
          totalReservations: { $sum: 1 },
          totalGuests: { $sum: "$partySize" },
          totalRevenue: { $sum: "$deposit" },
        },
      },
      {
        $lookup: {
          from: "vendors",
          localField: "_id",
          foreignField: "_id",
          as: "vendor",
        },
      },
      {
        $unwind: "$vendor",
      },
      {
        $project: {
          vendorId: "$_id",
          businessName: "$vendor.businessName",
          vendorType: "$vendor.vendorType",
          totalReservations: 1,
          totalGuests: 1,
          totalRevenue: 1,
          averageRating: "$vendor.rating",
        },
      },
      {
        $sort: { totalRevenue: -1 },
      },
      {
        $limit: 10,
      },
    ]);

    res.status(200).json(topVendors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get vendors earnings
// @route   GET /api/dashboard/vendors-earnings
// @access  Private (Admin only)
export const getVendorsEarnings = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const earnings = await Payment.aggregate([
      {
        $match: { status: "Paid" }
      },
      {
        $group: {
          _id: "$vendor",
          totalEarnings: { $sum: "$amount" },
          totalPayments: { $sum: 1 },
          lastPaymentDate: { $max: "$createdAt" }
        }
      },
      {
        $lookup: {
          from: "vendors",
          localField: "_id",
          foreignField: "_id",
          as: "vendor"
        }
      },
      {
        $unwind: "$vendor"
      },
      {
        $project: {
          vendorId: "$_id",
          vendorName: "$vendor.businessName",
          totalEarnings: 1,
          totalPayments: 1,
          lastPaymentDate: 1
        }
      },
      {
        $sort: { totalEarnings: -1 }
      },
      {
        $skip: skip
      },
      {
        $limit: parseInt(limit)
      }
    ]);

    const totalVendors = await Payment.distinct("vendor", { status: "Paid" }).then(vendors => vendors.length);

    return res.json({
      earnings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalVendors,
        pages: Math.ceil(totalVendors / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching vendors earnings:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getRecentTransactions = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    // Fetch recent hotel payment transactions
    const hotelTransactions = await PaymentTransaction.find({ status: "succeeded" })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate({
        path: "booking",
        populate: [
          { path: "guest", select: "name email" },
          { path: "hotel", select: "name" }
        ]
      });

    // Fetch recent vendor payments (clubs and restaurants)
    const vendorPayments = await Payment.find({ status: "Paid" })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("vendor", "businessName");

    // Combine and format transactions
    const allTransactions = [
      ...hotelTransactions.map(t => ({
        id: t._id,
        type: "hotel",
        amount: t.amount,
        status: t.status,
        createdAt: t.createdAt,
        guest: t.booking?.guest,
        entity: t.booking?.hotel?.name,
        method: t.method
      })),
      ...vendorPayments.map(p => ({
        id: p._id,
        type: "vendor",
        amount: p.amount,
        status: p.status,
        createdAt: p.createdAt,
        guest: { name: p.customer_name, email: p.email },
        entity: p.vendor?.businessName,
        method: p.paymentMethod
      }))
    ];

    // Sort by createdAt descending and limit to 10
    allTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const recentTransactions = allTransactions.slice(0, 10);

    res.status(200).json(recentTransactions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
