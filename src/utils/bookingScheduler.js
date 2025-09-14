import Booking from "../models/booking.model.js";
import { recordAuditLog } from "./auditLogger.js";

export const updateBookingStatuses = async () => {
  try {
    const now = new Date();

    // 1. Update 'upcoming' to 'completed' for bookings where checkOutDate has passed
    const completedBookings = await Booking.updateMany(
      {
        status: "upcoming",
        checkOutDate: { $lte: now },
      },
      { $set: { status: "completed" } }
    );

    if (completedBookings.modifiedCount > 0) {
      console.log(`Updated ${completedBookings.modifiedCount} bookings to 'completed'.`);
      // Ideally, log each booking individually or a summary
      // For simplicity, a single audit log for the batch update
      recordAuditLog(null, "BATCH_UPDATE_BOOKING_STATUS", "Booking", null, { status: "completed", count: completedBookings.modifiedCount });
    }

    // 2. Update 'upcoming' to 'no-show' for bookings where checkInDate has passed but are not checked out
    // This assumes a grace period or a specific time after check-in to mark as no-show
    // For now, let's say if checkInDate has passed and status is still 'upcoming'
    const noShowBookings = await Booking.updateMany(
      {
        status: "upcoming",
        checkInDate: { $lte: now },
        // Add a condition to ensure it's past the typical check-in time, e.g., 6 hours after check-in date
        // For simplicity, we'll just use checkInDate for now, but a more robust solution would consider check-in time
      },
      { $set: { status: "no-show" } }
    );

    if (noShowBookings.modifiedCount > 0) {
      console.log(`Updated ${noShowBookings.modifiedCount} bookings to 'no-show'.`);
      recordAuditLog(null, "BATCH_UPDATE_BOOKING_STATUS", "Booking", null, { status: "no-show", count: noShowBookings.modifiedCount });
    }

  } catch (error) {
    console.error("Error updating booking statuses:", error);
  }
};

export const notifyUpcomingBookings = async () => {
  try {
    const now = new Date();
    const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);

    const upcomingBookings = await Booking.find({
      status: "upcoming",
      checkInDate: { $gte: now, $lte: thirtyMinutesFromNow },
    }).populate("guest", "name").populate("hotel", "name");

    if (upcomingBookings.length > 0) {
      console.log(`Found ${upcomingBookings.length} bookings commencing soon.`);
      // Emit Socket.io event for each upcoming booking
      if (global.io) {
        upcomingBookings.forEach(booking => {
          global.io.emit("upcomingBooking", {
            bookingCode: booking.bookingCode,
            guestName: booking.guest ? booking.guest.name : "N/A",
            hotelName: booking.hotel ? booking.hotel.name : "N/A",
            checkInDate: booking.checkInDate,
          });
        });
      }
    }
  } catch (error) {
    console.error("Error notifying upcoming bookings:", error);
  }
};

// Function to start the scheduler
export const startBookingScheduler = (intervalMinutes = 60) => {
  // Run immediately on startup
  updateBookingStatuses();
  notifyUpcomingBookings(); // Also notify upcoming bookings on startup

  // Then run at specified intervals
  setInterval(() => {
    updateBookingStatuses();
    notifyUpcomingBookings();
  }, intervalMinutes * 60 * 1000);
  console.log(`Booking status and notification scheduler started, running every ${intervalMinutes} minutes.`);
};