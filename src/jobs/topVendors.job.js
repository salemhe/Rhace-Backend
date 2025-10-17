import cron from "node-cron";
import Vendor from "../models/vendor.model.js";
import Reservation from "../models/reservation.model.js";
import PaymentTransaction from "../models/paymenttransaction.model.js";

// Top vendors aggregation job
const updateTopVendors = async () => {
  try {
    console.log("Starting top vendors aggregation job...");

    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const nextMonth = new Date(currentMonth);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    // Aggregate vendor performance metrics
    const vendorStats = await Reservation.aggregate([
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
          totalRevenue: { $sum: "$totalAmount" }, // Assuming totalAmount field exists
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

    // Update vendors with ranking
    for (let i = 0; i < vendorStats.length; i++) {
      const stat = vendorStats[i];
      await Vendor.findByIdAndUpdate(stat.vendorId, {
        monthlyStats: {
          rank: i + 1,
          reservations: stat.totalReservations,
          revenue: stat.totalRevenue,
          guests: stat.totalGuests,
        },
      });
    }

    console.log(`Updated top ${vendorStats.length} vendors for current month`);

  } catch (error) {
    console.error("Top vendors aggregation failed:", error);
  }
};

// Schedule job to run weekly on Monday at 3 AM
export const startTopVendorsJob = () => {
  cron.schedule("0 3 * * 1", updateTopVendors);
  console.log("Top vendors job scheduled to run weekly on Monday at 3 AM");
};

// Manual trigger for testing
export const triggerTopVendorsUpdate = updateTopVendors;
