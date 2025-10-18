import { Booking } from "../models/booking.model.js";
import PaymentTransaction from "../models/paymenttransaction.model.js";
import Hotel from "../models/hotel.model.js";
import RoomType from "../models/roomtype.model.js";

// Emit real-time updates
const emitDashboardUpdate = (userId, data) => {
  if (global.io) {
    global.io.to(`dashboard_${userId}`).emit('dashboard_update', data);
  }
};

// @desc    Get dashboard KPIs
// @route   GET /api/dashboard/kpis
// @access  Private
export const getKPIs = async (req, res) => {
  try {
    const userId = req.user._id;
    const vendorType = req.user.vendorType;

    // Get hotels owned by the user
    const hotels = await Hotel.find({ createdBy: userId });
    const hotelIds = hotels.map(h => h._id);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const lastWeek = new Date(today);
    lastWeek.setDate(today.getDate() - 7);
    const twoWeeksAgo = new Date(today);
    twoWeeksAgo.setDate(today.getDate() - 14);

    // Total Bookings
    const totalBookings = await Booking.countDocuments({ hotel: { $in: hotelIds } });

    // Reservations made today
    const reservationsToday = await Booking.countDocuments({
      hotel: { $in: hotelIds },
      createdAt: { $gte: today, $lt: tomorrow },
    });

    // Confirmed Bookings (upcoming or completed)
    const confirmedBookings = await Booking.countDocuments({
      hotel: { $in: hotelIds },
      status: { $in: ["upcoming", "completed"] }
    });

    // Total Bookings Last Week
    const totalBookingsLastWeek = await Booking.countDocuments({
      hotel: { $in: hotelIds },
      createdAt: { $gte: lastWeek, $lt: today },
    });

    // Total Bookings Two Weeks Ago (for delta calculation)
    const totalBookingsTwoWeeksAgo = await Booking.countDocuments({
      hotel: { $in: hotelIds },
      createdAt: { $gte: twoWeeksAgo, $lt: lastWeek },
    });

    // Total Revenue
    const totalRevenue = await PaymentTransaction.aggregate([
      { $match: { hotel: { $in: hotelIds }, status: "succeeded" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const revenue = totalRevenue.length > 0 ? totalRevenue[0].total : 0;

    // Total Revenue Last Week
    const totalRevenueLastWeek = await PaymentTransaction.aggregate([
      { $match: { hotel: { $in: hotelIds }, status: "succeeded", createdAt: { $gte: lastWeek, $lt: today } } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const revenueLastWeek = totalRevenueLastWeek.length > 0 ? totalRevenueLastWeek[0].total : 0;

    // Total Revenue Two Weeks Ago (for delta calculation)
    const totalRevenueTwoWeeksAgo = await PaymentTransaction.aggregate([
      { $match: { hotel: { $in: hotelIds }, status: "succeeded", createdAt: { $gte: twoWeeksAgo, $lt: lastWeek } } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const revenueTwoWeeksAgo = totalRevenueTwoWeeksAgo.length > 0 ? totalRevenueTwoWeeksAgo[0].total : 0;

    // Pending Payments
    const pendingPayments = await PaymentTransaction.countDocuments({
      hotel: { $in: hotelIds },
      status: "pending"
    });

    // Occupancy Rate (simplified: based on total bookings vs total rooms)
    // This is a rough estimate; real occupancy would need date ranges
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
      confirmedBookings,
      totalRevenue: revenue,
      pendingPayments,
      occupancyRate: Math.min(occupancyRate, 100), // Cap at 100%
      bookingsDelta,
      revenueDelta,
    };

    // Emit real-time update
    emitDashboardUpdate(userId, { type: 'kpis', data: kpiData });

    res.status(200).json(kpiData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get reservations commencing banner (upcoming bookings starting soon)
// @route   GET /api/dashboard/upcoming-reservations
// @access  Private
export const getUpcomingReservations = async (req, res) => {
  try {
    const userId = req.user._id;
    const hotels = await Hotel.find({ createdBy: userId });
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
// @access  Private
export const getTodaysReservations = async (req, res) => {
  try {
    const userId = req.user._id;
    const hotels = await Hotel.find({ createdBy: userId });
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
// @access  Private
export const getBookingTrends = async (req, res) => {
  try {
    const userId = req.user._id;
    const hotels = await Hotel.find({ createdBy: userId });
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
// @access  Private
export const getRevenueTrends = async (req, res) => {
  try {
    const userId = req.user._id;
    const hotels = await Hotel.find({ createdBy: userId });
    const hotelIds = hotels.map(h => h._id);

    // Group payments by month
    const trends = await PaymentTransaction.aggregate([
      { $match: { hotel: { $in: hotelIds }, status: "completed" } },
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



