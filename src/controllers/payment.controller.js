import { Vendor } from "../models/vendor.model.js";
import Payment from "../models/payment.model.js";
import moment from "moment";
import { Booking } from "../models/booking.model.js";
import Reservation from "../models/reservation.model.js";
import { getVendorSocket } from "../websockets/socketManager.js";
import { MenuItem } from "../models/menu.model.js";
import RoomType from "../models/roomtype.model.js";
import Drink from "../models/drink.model.js";
import axios from "axios";
import Table from "../models/table.model.js";
import BottleSet from "../models/bottleSet.model.js";

// Emit real-time updates for payments
// export const emitPaymentUpdate = (reservationId, status) => {
//   if (global.io) {
//     console.log("Emitting payment_update event:", { reservationId, status });
//     global.io.emit("payment_update", { reservationId, status });
//     console.log("Emitting payment_update event:", data);
//     global.io.to("admin_payments").emit("payment_update", data);
//   }
// };

const percentChange = (current, previous) => {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
};

export const getBanks = async (req, res) => {
  try {
    const response = await fetch("https://api.paystack.co/bank", {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    });

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error("Error fetching banks from Paystack:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// @desc    Get admin's total earnings (vendor percentage minus Paystack commission)
// @route   GET /api/payments/admin-earnings
// @access  Private (Admin only)
export const getAdminTotalEarnings = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "superadmin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const { period = "all", startDate, endDate } = req.query;

    // Build date filter
    let dateFilter = {};
    const now = new Date();

    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      };
    } else if (period === "week") {
      const lastWeek = new Date(now.setDate(now.getDate() - 7));
      dateFilter = { createdAt: { $gte: lastWeek } };
    } else if (period === "month") {
      const lastMonth = new Date(now.setMonth(now.getMonth() - 1));
      dateFilter = { createdAt: { $gte: lastMonth } };
    } else if (period === "year") {
      const lastYear = new Date(now.setFullYear(now.getFullYear() - 1));
      dateFilter = { createdAt: { $gte: lastYear } };
    } else if (period === "today") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dateFilter = { createdAt: { $gte: today } };
    }
    // "all" period - no date filter needed

    // Get all successful payments with vendor info
    const payments = await Payment.find({
      ...dateFilter,
      status: "success",
      isSplitPayment: true,
    }).populate({
      path: "vendor",
      select: "percentageCharge businessName",
    });

    // Calculate admin earnings for each payment
    // Admin earnings = (payment amount × vendor percentage) - (payment amount × Paystack commission)
    // Paystack commission is 9.5% (0.095)
    const PAYSTACK_COMMISSION = 0.095;

    let totalGrossAmount = 0;
    let totalVendorCommission = 0;
    let totalPaystackCommission = 0;
    let totalAdminEarnings = 0;
    let totalPayments = 0;

    const vendorBreakdown = {};

    payments.forEach((payment) => {
      const grossAmount = payment.amount || 0;
      const vendorPercentage = payment.vendor?.percentageCharge || 0;

      // Calculate commissions
      const vendorCommission = grossAmount * (vendorPercentage / 100);
      const paystackCommission = grossAmount * PAYSTACK_COMMISSION;
      const adminEarning = vendorCommission - paystackCommission;

      totalGrossAmount += grossAmount;
      totalVendorCommission += vendorCommission;
      totalPaystackCommission += paystackCommission;
      totalAdminEarnings += adminEarning;
      totalPayments += 1;

      // Track by vendor
      const vendorId = payment.vendor?._id?.toString();
      if (vendorId) {
        if (!vendorBreakdown[vendorId]) {
          vendorBreakdown[vendorId] = {
            vendorId,
            vendorName: payment.vendor?.businessName || "Unknown",
            vendorPercentage,
            grossAmount: 0,
            vendorCommission: 0,
            paystackCommission: 0,
            adminEarnings: 0,
            paymentCount: 0,
          };
        }
        vendorBreakdown[vendorId].grossAmount += grossAmount;
        vendorBreakdown[vendorId].vendorCommission += vendorCommission;
        vendorBreakdown[vendorId].paystackCommission += paystackCommission;
        vendorBreakdown[vendorId].adminEarnings += adminEarning;
        vendorBreakdown[vendorId].paymentCount += 1;
      }
    });

    return res.json({
      period,
      dateRange: startDate && endDate ? { startDate, endDate } : null,
      summary: {
        totalGrossAmount: Math.round(totalGrossAmount * 100) / 100,
        totalVendorCommission: Math.round(totalVendorCommission * 100) / 100,
        totalPaystackCommission:
          Math.round(totalPaystackCommission * 100) / 100,
        totalAdminEarnings: Math.round(totalAdminEarnings * 100) / 100,
        totalPayments,
        averagePaymentAmount:
          totalPayments > 0
            ? Math.round((totalGrossAmount / totalPayments) * 100) / 100
            : 0,
      },
      vendorBreakdown: Object.values(vendorBreakdown),
      calculations: {
        paystackCommissionRate: `${PAYSTACK_COMMISSION * 100}%`,
        formula:
          "Admin Earnings = (Gross Amount × Vendor %) - (Gross Amount × 9.5%)",
      },
    });
  } catch (error) {
    console.error("Error fetching admin earnings:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// @desc    Get total successful payments count
// @route   GET /api/payments/successful-count
// @access  Private (Admin only)
export const getTotalSuccessfulPayments = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "superadmin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const { period = "all", startDate, endDate } = req.query;

    // Build date filter
    let dateFilter = {};
    const now = new Date();

    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      };
    } else if (period === "week") {
      const lastWeek = new Date(now.setDate(now.getDate() - 7));
      dateFilter = { createdAt: { $gte: lastWeek } };
    } else if (period === "month") {
      const lastMonth = new Date(now.setMonth(now.getMonth() - 1));
      dateFilter = { createdAt: { $gte: lastMonth } };
    } else if (period === "year") {
      const lastYear = new Date(now.setFullYear(now.getFullYear() - 1));
      dateFilter = { createdAt: { $gte: lastYear } };
    } else if (period === "today") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dateFilter = { createdAt: { $gte: today } };
    }
    // "all" period - no date filter needed

    // Get total successful payments count
    const totalSuccessful = await Payment.countDocuments({
      ...dateFilter,
      status: "success",
    });

    // Get total failed payments count
    const totalFailed = await Payment.countDocuments({
      ...dateFilter,
      status: "failed",
    });

    // Get total pending payments count
    const totalPending = await Payment.countDocuments({
      ...dateFilter,
      status: "pending",
    });

    // Get total cancelled payments count
    const totalCancelled = await Payment.countDocuments({
      ...dateFilter,
      status: "cancelled",
    });

    // Get all payments for additional stats
    const allPayments = await Payment.find(dateFilter);
    const totalAllPayments = allPayments.length;

    // Calculate success rate
    const successRate =
      totalAllPayments > 0
        ? Math.round((totalSuccessful / totalAllPayments) * 10000) / 100
        : 0;

    // Get by payment method
    const byPaymentMethod = await Payment.aggregate([
      { $match: { ...dateFilter, status: "Paid" } },
      {
        $group: {
          _id: "$paymentMethod",
          count: { $sum: 1 },
          total: { $sum: "$amount" },
        },
      },
    ]);

    // Get by vendor type (through vendor lookup)
    const byVendorType = await Payment.aggregate([
      { $match: { ...dateFilter, status: "Paid" } },
      {
        $lookup: {
          from: "vendors",
          localField: "vendor",
          foreignField: "_id",
          as: "vendorInfo",
        },
      },
      { $unwind: "$vendorInfo" },
      {
        $group: {
          _id: "$vendorInfo.vendorType",
          count: { $sum: 1 },
          total: { $sum: "$amount" },
        },
      },
    ]);

    // Get daily/weekly/monthly breakdown
    const timeBreakdown = await Payment.aggregate([
      { $match: { ...dateFilter, status: "Paid" } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
          total: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1, "_id.day": -1 } },
      { $limit: 30 },
    ]);

    return res.json({
      period,
      dateRange: startDate && endDate ? { startDate, endDate } : null,
      summary: {
        totalSuccessful,
        totalFailed,
        totalPending,
        totalCancelled,
        totalAllPayments,
        successRate: `${successRate}%`,
      },
      byPaymentMethod: byPaymentMethod.map((item) => ({
        method: item._id || "unknown",
        count: item.count,
        total: item.total || 0,
      })),
      byVendorType: byVendorType.map((item) => ({
        vendorType: item._id || "unknown",
        count: item.count,
        total: item.total || 0,
      })),
      timeBreakdown: timeBreakdown.map((item) => ({
        date: `${item._id.year}-${String(item._id.month).padStart(2, "0")}-${String(item._id.day).padStart(2, "0")}`,
        count: item.count,
        total: item.total || 0,
      })),
    });
  } catch (error) {
    console.error("Error fetching successful payments count:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const verifyAccount = async (req, res) => {
  const { account_number, bank_code } = req.query;

  if (!account_number || !bank_code) {
    return res
      .status(400)
      .json({ error: "Missing account number or bank code" });
  }

  try {
    const paystackRes = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    const data = await paystackRes.json();

    if (!data.status) {
      return res.status(400).json({ error: data.message });
    }

    return res.json({
      accountName: data.data.account_name,
      accountNumber: data.data.account_number,
      bankCode: bank_code,
    });
  } catch (error) {
    console.error("Paystack error:", error);
    return res.status(500).json({ error: "Server error verifying account" });
  }
};

export const getPayments = async (req, res) => {
  try {
    let query = {};
    console.log(req.user);
    if (req.user.role !== "admin") {
      if (req.user.role === "vendor") {
        query.vendor = req.user._id;
        query.isSplitPayment = true;
      } else {
        query.user = req.user._id;
      }
    }
    const payments = await Payment.find(query)
      .sort({ createdAt: -1 })
      .populate({ path: "vendor" });

    return res.json(payments);
  } catch (error) {
    console.error("Error fetching payments:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getPaymentStats = async (req, res) => {
  const userId = req.user._id;
  const isAdmin = req.user.role === "admin";

  // Weekly Ranges
  const startOfThisWeek = moment().startOf("isoWeek");
  const startOfLastWeek = moment().subtract(1, "weeks").startOf("isoWeek");
  const endOfLastWeek = moment().subtract(1, "weeks").endOf("isoWeek");

  // Yearly Ranges
  const startOfThisYear = moment().startOf("year");
  const startOfLastYear = moment().subtract(1, "year").startOf("year");
  const endOfLastYear = moment().subtract(1, "year").endOf("year");

  try {
    const vendorFilter = isAdmin ? {} : { vendor: userId };

    // Yearly Earnings
    const thisYearEarnings = await Payment.aggregate([
      {
        $match: {
          ...vendorFilter,
          createdAt: { $gte: startOfThisYear.toDate() },
          status: { $in: ["Paid", "success", "paid"] },
          payLater: false,
        },
      },
      { $group: { _id: null, total: { $sum: "$amountPaid" } } },
    ]);

    const lastYearEarnings = await Payment.aggregate([
      {
        $match: {
          ...vendorFilter,
          createdAt: {
            $gte: startOfLastYear.toDate(),
            $lte: endOfLastYear.toDate(),
          },
          status: { $in: ["Paid", "success", "paid"] },
          payLater: false,
        },
      },
      { $group: { _id: null, total: { $sum: "$amountPaid" } } },
    ]);

    // Weekly Earnings
    const thisWeekEarnings = await Payment.aggregate([
      {
        $match: {
          ...vendorFilter,
          createdAt: { $gte: startOfThisWeek.toDate() },
          status: { $in: ["Paid", "success", "paid"] },
          payLater: false,
        },
      },
      { $group: { _id: null, total: { $sum: "$amountPaid" } } },
    ]);

    const lastWeekEarnings = await Payment.aggregate([
      {
        $match: {
          ...vendorFilter,
          createdAt: {
            $gte: startOfLastWeek.toDate(),
            $lte: endOfLastWeek.toDate(),
          },
          status: { $in: ["Paid", "success", "paid"] },
          payLater: false,
        },
      },
      { $group: { _id: null, total: { $sum: "$amountPaid" } } },
    ]);

    // Completed Payments
    const completedThisWeek = await Payment.countDocuments({
      ...vendorFilter,
      status: "success",
      payLater: false,
      createdAt: { $gte: startOfThisWeek.toDate() },
    });

    const completedLastWeek = await Payment.countDocuments({
      ...vendorFilter,
      status: "success",
      payLater: false,
      createdAt: {
        $gte: startOfLastWeek.toDate(),
        $lte: endOfLastWeek.toDate(),
      },
    });

    // Pending Payments
    const pendingThisWeek = await Payment.countDocuments({
      ...vendorFilter,
      status: "pending",
      payLater: false,
      createdAt: { $gte: startOfThisWeek.toDate() },
    });

    const pendingLastWeek = await Payment.countDocuments({
      ...vendorFilter,
      status: "pending",
      payLater: false,
      createdAt: {
        $gte: startOfLastWeek.toDate(),
        $lte: endOfLastWeek.toDate(),
      },
    });

    return res.json({
      earnings: {
        thisYear: thisYearEarnings[0]?.total || 0,
        lastYear: lastYearEarnings[0]?.total || 0,
        yearChange: percentChange(
          thisYearEarnings[0]?.total || 0,
          lastYearEarnings[0]?.total || 0,
        ),

        thisWeek: thisWeekEarnings[0]?.total || 0,
        lastWeek: lastWeekEarnings[0]?.total || 0,
        weekChange: percentChange(
          thisWeekEarnings[0]?.total || 0,
          lastWeekEarnings[0]?.total || 0,
        ),
      },

      payments: {
        completed: {
          thisWeek: completedThisWeek,
          lastWeek: completedLastWeek,
          change: percentChange(completedThisWeek, completedLastWeek),
        },
        pending: {
          thisWeek: pendingThisWeek,
          lastWeek: pendingLastWeek,
          change: percentChange(pendingThisWeek, pendingLastWeek),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching payment stats:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getTrends = async (req, res) => {
  const userId = req.user._id;
  const isAdmin = req.user.role === "admin";
  const range = req.query.range || "weekly";

  let unit;
  let startDate;

  switch (range) {
    case "monthly":
      unit = "month";
      startDate = moment().subtract(6, "months").startOf("month").toDate();
      break;
    case "quarterly":
      unit = "quarter";
      startDate = moment().subtract(4, "quarters").startOf("quarter").toDate();
      break;
    default:
      unit = "week";
      startDate = moment().subtract(7, "weeks").startOf("isoWeek").toDate();
  }

  const endOfLastWeek = moment().subtract(1, "weeks").endOf("isoWeek");

  try {
    const vendorFilter = isAdmin ? {} : { vendor: userId };

    const trends = await Payment.aggregate([
      {
        $match: {
          ...vendorFilter,
          status: "success",
          isSplitPayment: true,
          payLater: false,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            $dateTrunc: {
              date: "$createdAt",
              unit: unit,
              timezone: "UTC",
            },
          },
          totalEarnings: { $sum: "$amountPaid" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const buckets = [];
    const now = moment.utc();

    if (range === "weekly") {
      for (let i = 7; i >= 0; i--) {
        const d = now.clone().subtract(i, "weeks").startOf("isoWeek");
        buckets.push({
          key: d.format("YYYY-[W]WW"),
          label: d.format("[Week of] MMM DD"),
          value: 0,
        });
      }
    }

    if (range === "monthly") {
      for (let i = 5; i >= 0; i--) {
        const d = now.clone().subtract(i, "months").startOf("month");
        buckets.push({
          key: d.format("YYYY-MM"),
          label: d.format("MMM YYYY"),
          value: 0,
        });
      }
    }

    if (range === "quarterly") {
      for (let i = 3; i >= 0; i--) {
        const d = now.clone().subtract(i, "quarters").startOf("quarter");
        buckets.push({
          key: `${d.year()}-Q${d.quarter()}`,
          label: `Q${d.quarter()} ${d.year()}`,
          value: 0,
        });
      }
    }

    trends.forEach((item) => {
      if (!item._id) return;

      let key;

      if (range === "weekly") {
        key = moment.utc(item._id).format("YYYY-[W]WW");
      }

      if (range === "monthly") {
        key = moment.utc(item._id).format("YYYY-MM");
      }

      if (range === "quarterly") {
        const m = moment.utc(item._id);
        key = `${m.year()}-Q${m.quarter()}`;
      }

      const bucket = buckets.find((b) => b.key === key);
      if (bucket) {
        bucket.value = item.totalEarnings;
      }
    });

    const formattedTrends = buckets.map(({ label, value }) => ({
      label,
      value,
    }));

    const totalEarnings = await Payment.aggregate([
      { $match: { ...vendorFilter, status: "success", isSplitPayment: true, payLater: false, } },
      { $group: { _id: null, total: { $sum: "$amountPaid" } } },
    ]);

    const totalEarningsUntilLastWeek = await Payment.aggregate([
      {
        $match: {
          ...vendorFilter,
          status: "success",
          isSplitPayment: true,
          payLater: false,
          createdAt: { $lte: endOfLastWeek.toDate() },
        },
      },
      { $group: { _id: null, total: { $sum: "$amountPaid" } } },
    ]);

    const totalEarningsValue = totalEarnings[0]?.total || 0;
    const totalUntilLastWeekValue = totalEarningsUntilLastWeek[0]?.total || 0;
    const percentChangeTotalToLastWeek = percentChange(
      totalEarningsValue,
      totalUntilLastWeekValue,
    );

    return res.json({
      range,
      trends: formattedTrends,
      totalEarnings: totalUntilLastWeekValue,
      percentChange: percentChangeTotalToLastWeek,
    });
  } catch (error) {
    console.error("Error fetching payment trends:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getPaymentInfo = async (req, res) => {
  const userId = req.user._id;

  try {
    const user = await Vendor.findById(userId).select(
      "paymentDetails bankName accountNumber balance",
    );
    const payment = await Payment.findOne({ vendor: userId }).sort({ createdAt: -1 });

    if (!user) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    const { paymentDetails, balance } = user;

    const response = await fetch(
      `https://nigerianbanks.xyz/?code=${paymentDetails?.bankCode}`,
    );
    if (!response.ok) {
      console.error("Error fetching bank info:", await response.text());
      return res.status(500).json({ error: "Failed to fetch bank info" });
    }

    const data = await response.json();

    const maskedAccountNumber = paymentDetails?.accountNumber
      ? paymentDetails.accountNumber
          .slice(-5)
          .padStart(paymentDetails.accountNumber.length, "*")
      : "N/A";

    return res.json({
      bankCode: paymentDetails?.bankCode || null,
      accountNumber: maskedAccountNumber,
      subaccountCode: paymentDetails?.subaccountCode || null,
      bankName: paymentDetails?.bankName || null,
      accountName: paymentDetails?.accountName || null,
      bankLogo: data?.logo || null,
      balance: balance || 0,
      lastPayment: payment.createdAt,
    });
  } catch (error) {
    console.error("Error fetching payment info:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const initializePayment = async (req, res) => {
  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
  try {
    const {
      vendorId,
      reservationType,
      location,
      customerName,
      customerEmail,
      payLater,
      date,
      time,
      guests,
      mealPreselected,
      menus,
      specialOccasion,
      seatingPreference,
      specialRequest,
      checkInDate,
      checkOutDate,
      rooms,
      drinks,
      combos,
      partPaid,
      table,
    } = req.body;

    if (!req.user || !req.user._id) {
      return res
        .status(403)
        .json({ message: "Unauthorized: No User ID found" });
    }

    if (!vendorId || !reservationType || !location || !customerEmail) {
      return res.status(400).json({
        message: "Missing required fields",
      });
    }

    if (reservationType === "restaurant" && (!date || !time || !guests)) {
      return res.status(400).json({
        message: "Missing restaurant required fields",
      });
    }
    // Hotel fields optional for partPaid/deposits
    if (
      reservationType === "hotel" &&
      !partPaid &&
      (!checkInDate || !checkOutDate || !guests || !rooms)
    ) {
      return res.status(400).json({
        message:
          "Hotel full payment requires: checkInDate, checkOutDate, guests, roomId",
        missing: ["checkInDate", "checkOutDate", "guests", "roomId"],
        fix: "Use partPaid: true for deposits",
      });
    }
    if (
      reservationType === "club" &&
      (!date ||
        !time ||
        !guests ||
        !drinks ||
        !Array.isArray(drinks) ||
        drinks.length === 0)
    ) {
      return res.status(400).json({
        message:
          "Club requires: date(Date), time(HH:MM format), guests(number), drinks(non-empty array of {drink: ObjectId, quantity: number})",
        missing: {
          date: !!date,
          time: !!time,
          guests: !!guests,
          drinks: Array.isArray(drinks) ? drinks.length > 0 : false,
        },
      });
    }

    let totalAmount = 0;

    if (payLater) {
      totalAmount = 1000;
    } else {
      if (reservationType === "restaurant" && menus) {
        const menuIds = menus.map((m) => m.menuId);
        const menuItems = await MenuItem.find({ _id: { $in: menuIds } });

        totalAmount = menus.reduce((sum, item) => {
          const menu = menuItems.find((m) => m._id.toString() === item.menuId);
          if (!menu) throw new Error(`Menu item ${item.menuId} not found`);
          return sum + menu.price * item.quantity;
        }, 0);
      }

      if (reservationType === "hotel") {
        if (rooms.length < 1) {
          // Default deposit amount for hotel without room details
          totalAmount = 25000; // NGN 25k default deposit
          console.log("Using default hotel deposit amount: 25000");
        } else {
          const roomIds = rooms.map((r) => r.roomId);
          const room = await RoomType.find({ _id: { $in: roomIds } });

          totalAmount = rooms.reduce((sum, item) => {
            const nights = Math.ceil(
              (new Date(item.checkOutDate) - new Date(item.checkInDate)) /
                (1000 * 60 * 60 * 24),
            );
            const rooms = room.find((d) => d._id.toString() === item.roomId);
            if (!rooms) throw new Error(`Room ${item.drink} not found`);
            console.log(`Calculating room ${rooms.name}: pricePerNight=${rooms.pricePerNight}, discount=${rooms.discount}%, nights=${nights}, quantity=${item.quantity}`);
            return (sum +
              (rooms.pricePerNight -
                rooms.pricePerNight * (rooms.discount / 100)) *
              nights * item.quantity
            );
          }, 0);
        }
      }

      if (reservationType === "club" && drinks && table) {
        const drinkIds = drinks.map((d) => d.drink);
        const tableIds = table.map((t) => t._id);
        const drinkItems = await Drink.find({ _id: { $in: drinkIds } });
        const tableItem = await Table.find({ _id: { $in: tableIds } });

        totalAmount = drinks.reduce((sum, item) => {
          const drink = drinkItems.find((d) => d._id.toString() === item.drink);
          if (!drink) throw new Error(`Drink ${item.drink} not found`);
          return sum + drink.price * item.quantity;
        }, 0);
        totalAmount += table.reduce((sum, item) => {
          const tables = tableItem.find((t) => t._id.toString() === item._id);
          if (!tables) throw new Error(`Table ${item._id} not found`);
          return sum + tables.price * item.quantity;
        }, 0);

        if (combos && combos.length > 0) {
          const comboItems = await BottleSet.find({ _id: { $in: combos } });
          totalAmount += comboItems.reduce(
            (sum, combo) => sum + combo.setPrice,
            0,
          );
        }
      }
      if (partPaid) {
        totalAmount /= 2;
      }
    }

    const generateResId = () => {
      return `RES${Date.now()}${Math.random().toString(36).substr(2, 9)}`.toUpperCase();
    };

    let resId = generateResId();

    while (await Payment.findOne({ booking: resId })) {
      resId = generateResId();
    }

    const payment = await Payment.create({
      booking: resId,
      user: req.user._id, // From auth middleware
      vendor: vendorId,
      email: customerEmail,
      customerName,
      amount: totalAmount,
      amountPaid: totalAmount - totalAmount * 0.095,
      status: "pending",
      payLater,
      partPaid,
      booked: false,
      ...(!payLater && {
        isSplitPayment: true,
      }),

      metadata: {
        vendorId,
        reservationType,
        location,
        customerName,
        customerEmail,

        ...(reservationType === "restaurant" && {
          date,
          time,
          guests,
          mealPreselected,
          menus,
          specialOccasion,
          seatingPreference,
          specialRequest,
        }),

        ...(reservationType === "hotel" && {
          rooms,
          specialRequest,
        }),

        ...(reservationType === "club" && {
          date,
          time,
          guests,
          drinks,
          combos,
          table,
          specialRequest,
        }),
      },
    });

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    console.log("🧾 Vendor payment details:", {
      hasSubaccount: !!vendor.paymentDetails?.subaccountCode,
      subaccountCode: vendor.paymentDetails?.subaccountCode || "MISSING",
      vendorType: vendor.vendorType,
      vendorId: vendor._id,
    });

    // Build Paystack payload with subaccount fallback
    const paystackPayload = {
      email: customerEmail,
      amount: totalAmount * 100,
      reference: payment._id.toString(),
      callback_url: `${process.env.FRONTEND_URL}/${reservationType.split("R")[0]}s/confirmation/${payment._id}`,
      metadata: {
        paymentId: payment._id,
        customerId: req.user._id,
        reservationType,
        payLater,
        vendorType: vendor.vendorType,
        vendorSubaccount: vendor.paymentDetails?.subaccountCode || null,
      },
    };

    // Only add subaccount if !payLater AND valid subaccountCode exists
    if (!payLater && vendor.paymentDetails?.subaccountCode) {
      paystackPayload.subaccount = vendor.paymentDetails.subaccountCode;
      console.log("✅ Using subaccount:", vendor.paymentDetails.subaccountCode);
    } else {
      console.log(
        "⚠️ Skipping subaccount (payLater or missing code) - using main account",
      );
    }

    const paystackResponse = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      paystackPayload,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    // Enhanced error handling
    if (paystackResponse.data.status === false) {
      console.error("❌ Paystack init failed:", paystackResponse.data.message, {
        vendorSubaccount: vendor.paymentDetails?.subaccountCode,
        amount: totalAmount,
        vendorType: vendor.vendorType,
      });
      return res.status(400).json({
        message: "Payment initialization failed",
        paystackError: paystackResponse.data.message,
        debug: {
          hasSubaccount: !!vendor.paymentDetails?.subaccountCode,
          vendorType: vendor.vendorType,
          fix: "Vendor needs Paystack subaccount configured in paymentDetails.subaccountCode",
        },
      });
    }

    await Payment.updateOne(
      { _id: payment._id },
      { paystackReference: paystackResponse.data.data.reference },
    );

    console.log("✅ Payment initialized successfully:", {
      ref: paystackResponse.data.data.reference,
      url: paystackResponse.data.data.authorization_url,
      usedSubaccount: !!paystackPayload.subaccount,
    });

    res.status(200).json({
      message: "success",
      data: {
        authorization_url: paystackResponse.data.data.authorization_url,
        access_code: paystackResponse.data.data.access_code,
        ref: paystackResponse.data.data.reference,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Error Initializing Payment",
      error: error.message || "Failed to initialize payment",
    });
  }
};

export const getVendorsEarnings = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const earnings = await Payment.aggregate([
      {
        $match: { status: "Paid" },
      },
      {
        $group: {
          _id: "$vendor",
          totalEarnings: { $sum: "$amount" },
          totalPayments: { $sum: 1 },
          lastPaymentDate: { $max: "$createdAt" },
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
          vendorName: "$vendor.businessName",
          totalEarnings: 1,
          totalPayments: 1,
          lastPaymentDate: 1,
        },
      },
      {
        $sort: { totalEarnings: -1 },
      },
      {
        $skip: skip,
      },
      {
        $limit: parseInt(limit),
      },
    ]);

    const totalVendors = await Payment.distinct("vendor", {
      status: "Paid",
    }).then((vendors) => vendors.length);

    return res.json({
      earnings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalVendors,
        pages: Math.ceil(totalVendors / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching vendors earnings:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getPaystackBalance = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "superadmin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const response = await fetch("https://api.paystack.co/balance", {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Paystack API error: ${response.status}`);
    }

    const data = await response.json();
    return res.json({
      balance: data.data,
      currency: data.data.currency || "NGN",
    });
  } catch (error) {
    console.error("Error fetching Paystack balance:", error);
    return res.status(500).json({ error: "Failed to fetch balance" });
  }
};

export const getPaystackTransactions = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "superadmin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const { page = 1, per_page = 50, status } = req.query;
    const params = new URLSearchParams({ page, per_page });
    if (status) params.append("status", status);

    const response = await fetch(
      `https://api.paystack.co/transaction?${params}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Paystack API error: ${response.status}`);
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error("Error fetching Paystack transactions:", error);
    return res.status(500).json({ error: "Failed to fetch transactions" });
  }
};

export const getPaystackSuccessfulCount = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "superadmin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const { from, to } = req.query;
    const params = new URLSearchParams();
    if (from) params.append("from", from);
    if (to) params.append("to", to);

    const response = await fetch(
      `https://api.paystack.co/statistics?${params}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Paystack API error: ${response.status}`);
    }

    const data = await response.json();
    return res.json({
      successful: data.data?.success?.count || 0,
      total: data.data?.total || 0,
      stats: data.data,
    });
  } catch (error) {
    console.error("Error fetching Paystack stats:", error);
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
};

export const verifyPayment = async (req, res) => {
  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
  const userId = req.user?._id;

  try {
    if (!req.user || !userId) {
      return res
        .status(403)
        .json({ message: "Unauthorized: No User ID found" });
    }

    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({ message: "Reference is required." });
    }

    if (!PAYSTACK_SECRET_KEY) {
      return res
        .status(500)
        .json({ message: "Paystack secret key not configured." });
    }

    const verifyPaymentOnPaystack = async (reference) => {
      const response = await fetch(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Paystack verification failed: ${response.statusText}`);
      }

      return await response.json();
    };

    const paystackResponse = await verifyPaymentOnPaystack(reference);

    if (!paystackResponse.status) {
      return res
        .status(500)
        .json({ message: paystackResponse.message || "Verification failed" });
    }

    const transaction = paystackResponse.data;

    if (transaction.status !== "success") {
      return res.status(400).json({ message: "Payment not successful." });
    }

    if (String(userId) !== transaction.metadata?.userId) {
      return res
        .status(403)
        .json({ message: "Unauthorized: Invalid User ID in metadata" });
    }

    const vendorId = transaction.metadata?.vendorId;
    const vendorSocket = getVendorSocket(vendorId);
    if (!vendorId) {
      return res
        .status(400)
        .json({ message: "Vendor ID is missing from metadata." });
    }

    const existingTransaction = await Payment.findOne({ reference });
    const amount = transaction.amount / 100;

    // ✅ TASK 2: Idempotency check - skip if already webhook-processed success
    if (
      existingTransaction &&
      existingTransaction.status === "success" &&
      existingTransaction.webhookProcessed
    ) {
      console.log(
        "⏭️ Payment already processed via webhook:",
        existingTransaction._id,
      );

      // Update reservations paymentStatus (safety net)
      await Promise.all([
        Booking.updateMany(
          { resId: existingTransaction.booking },
          { $set: { paymentStatus: "paid" } },
        ),
        Reservation.updateMany(
          { payment: existingTransaction._id },
          { $set: { paymentStatus: "paid" } },
        ),
      ]);

      const booking = await Booking.findOne({
        resId: existingTransaction.booking,
      });

      return res.status(200).json({
        success: true,
        alreadyProcessed: true,
        payment: existingTransaction,
        bookingId: existingTransaction.booking,
        booked: !!booking,
        message: "Payment already verified and processed via webhook",
      });
    }

    if (!existingTransaction) {
      // Save the payment
      const newTransaction = new Payment({
        email: transaction.metadata.email,
        customerName: transaction.metadata.customerName,
        paid_at: transaction.paid_at,
        vendor: vendorId,
        user: userId,
        booking: transaction.metadata.bookingId,
        paymentMethod: transaction.channel,
        amount: amount,
        amountPaid: amount,  // ✅ Full Paystack amount (consistent)
        reference,
        payLater: transaction.metadata.payLater,
        status: "success", // ✅ Consistent with payment model enum
        webhookProcessed: true, // ✅ Mark as processed
      });

      await newTransaction.save();

      // Update vendor balance
      const updatedVendor = await Vendor.findById(vendorId);
      if (updatedVendor) {
        updatedVendor.balance += amount;
        await updatedVendor.save();
      }

      if (vendorSocket && vendorSocket.readyState === 1) {
        vendorSocket.send(
          JSON.stringify({
            type: "new_payment",
            data: {
              ...newTransaction,
              message: "You have a new payment",
            },
          }),
        );
        console.log("Payment sent to vendor via WebSocket.");
      }

      // Emit real-time update for new payment
      // emitPaymentUpdate({
      //   type: "new_payment",
      //   paymentId: newTransaction._id,
      //   vendorId: vendorId,
      //   amount: amount,
      //   reference: reference,
      //   status: "success",
      //   createdAt: newTransaction.createdAt,
      // });
    } else {
      // Update existing transaction
      await Payment.updateOne(
        { _id: existingTransaction._id },
        {
          status: "success",
          webhookProcessed: true,
          paidAt: transaction.paid_at,
          amount: amount,  // ✅ Ensure amount matches Paystack
          amountPaid: amount,  // ✅ Full amount from Paystack (overrides initial estimate)
          paymentMethod: transaction.channel,
        },
      );
      
      // ✅ DEBUG: Log amount sync
      console.log('💰 Webhook amount sync:', {
        paymentId: existingTransaction._id,
        paystackAmount: amount,
        wasUpdated: true,
        discrepancyFixed: true
      });
    }

    // ✅ Update reservations paymentStatus
    await Promise.all([
      Booking.updateMany(
        { resId: transaction.metadata.bookingId },
        { $set: { paymentStatus: "paid" } },
      ),
      Reservation.updateMany(
        { payment: existingTransaction?._id || reference },
        { $set: { paymentStatus: "paid" } },
      ),
    ]);

    // Update booking payment status
    console.log("Booking ID from metadata:", transaction.metadata.bookingId);
    const booking = await Booking.findOne({
      resId: transaction.metadata.bookingId,
    });

    return res.status(200).json({
      message: "Transaction verified",
      status: transaction.status,
      transactionId: transaction.id,
      amount: transaction.amount,
      currency: transaction.currency,
      paid_at: transaction.paid_at,
      bookingId: transaction.metadata.bookingId,
      vendorId: vendorId,
      userId: userId,
      created_at: transaction.created_at,
      channel: transaction.channel,
      customer: {
        id: transaction.customer.id,
        email: transaction.customer.email,
        customer_code: transaction.customer.customer_code,
      },
      booked: !!booking,
    });
  } catch (error) {
    console.error("Error Verifying Payment:", error);
    return res.status(500).json({
      message: "Error Verifying Payment",
      error: error.message || "Unknown server error",
    });
  }
};

export const confirmVendorPayment = async (req, res) => {
  try {
    const { paymentId, resId, vendorId } = req.body;

    if (!paymentId || !resId || !vendorId) {
      return res.status(400).json({ message: "paymentId, resId, and vendorId required" });
    }

    // Vendor auth check
    if (req.user.role !== 'vendor' || req.user._id.toString() !== vendorId) {
      return res.status(403).json({ message: "Unauthorized: Vendor mismatch" });
    }

    // Find matching payment
    const payment = await Payment.findOne({
      _id: paymentId,
      booking: resId,
      vendor: vendorId,
      status: { $in: ['success', 'pending'] }
    }).populate('user vendor');

    if (!payment) {
      return res.status(404).json({ message: "Payment not found or not authorized" });
    }

    if (payment.vendorConfirmed) {
      return res.status(200).json({ 
        message: "Payment already confirmed by vendor",
        payment 
      });
    }

    // Confirm
    payment.vendorConfirmed = true;
    payment.vendorConfirmedAt = new Date();
    payment.vendorConfirmedBy = req.user._id;
    await payment.save();

    // Emit real-time update
emitPaymentUpdate(payment.booking, 'vendor_confirmed');

    res.status(200).json({ 
      success: true, 
      message: "Payment confirmed by vendor successfully",
      paymentId: payment._id,
      resId: payment.booking
    });
  } catch (error) {
    console.error("Error confirming vendor payment:", error);
    res.status(500).json({ 
      message: "Server error confirming payment",
      error: error.message 
    });
  }
};
