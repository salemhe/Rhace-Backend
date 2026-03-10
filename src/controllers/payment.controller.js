import { Vendor } from "../models/vendor.model.js";
import Payment from "../models/payment.model.js";
import moment from "moment";
import { Booking } from "../models/booking.model.js";
import { getVendorSocket } from "../websockets/socketManager.js";
import { MenuItem } from "../models/menu.model.js";
import RoomType from "../models/roomtype.model.js";
import Drink from "../models/drink.model.js";
import axios from "axios";
import Table from "../models/table.model.js";
import BottleSet from "../models/bottleSet.model.js";

// Emit real-time updates for payments
export const emitPaymentUpdate = (reservationId, status) => {
  if (global.io) {
    
    console.log('Emitting payment_update event:', { reservationId, status });
    global.io.emit('payment_update', { reservationId, status });
    console.log("Emitting payment_update event:", data);
    global.io.to("admin_payments").emit("payment_update", data);
  }
};


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
          $lte: new Date(endDate)
        }
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
      status: "Paid",
      isSplitPayment: true
    }).populate({
      path: "vendor",
      select: "percentageCharge businessName"
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

    payments.forEach(payment => {
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
            paymentCount: 0
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
        totalPaystackCommission: Math.round(totalPaystackCommission * 100) / 100,
        totalAdminEarnings: Math.round(totalAdminEarnings * 100) / 100,
        totalPayments,
        averagePaymentAmount: totalPayments > 0 
          ? Math.round((totalGrossAmount / totalPayments) * 100) / 100 
          : 0
      },
      vendorBreakdown: Object.values(vendorBreakdown),
      calculations: {
        paystackCommissionRate: `${PAYSTACK_COMMISSION * 100}%`,
        formula: "Admin Earnings = (Gross Amount × Vendor %) - (Gross Amount × 9.5%)"
      }
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
          $lte: new Date(endDate)
        }
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
      status: "Paid"
    });

    // Get total failed payments count
    const totalFailed = await Payment.countDocuments({
      ...dateFilter,
      status: "failed"
    });

    // Get total pending payments count
    const totalPending = await Payment.countDocuments({
      ...dateFilter,
      status: "Pending"
    });

    // Get total cancelled payments count
    const totalCancelled = await Payment.countDocuments({
      ...dateFilter,
      status: "cancelled"
    });

    // Get all payments for additional stats
    const allPayments = await Payment.find(dateFilter);
    const totalAllPayments = allPayments.length;

    // Calculate success rate
    const successRate = totalAllPayments > 0 
      ? Math.round((totalSuccessful / totalAllPayments) * 10000) / 100 
      : 0;

    // Get by payment method
    const byPaymentMethod = await Payment.aggregate([
      { $match: { ...dateFilter, status: "Paid" } },
      { $group: { _id: "$paymentMethod", count: { $sum: 1 }, total: { $sum: "$amount" } } }
    ]);

    // Get by vendor type (through vendor lookup)
    const byVendorType = await Payment.aggregate([
      { $match: { ...dateFilter, status: "Paid" } },
      {
        $lookup: {
          from: "vendors",
          localField: "vendor",
          foreignField: "_id",
          as: "vendorInfo"
        }
      },
      { $unwind: "$vendorInfo" },
      { $group: { _id: "$vendorInfo.vendorType", count: { $sum: 1 }, total: { $sum: "$amount" } } }
    ]);

    // Get daily/weekly/monthly breakdown
    const timeBreakdown = await Payment.aggregate([
      { $match: { ...dateFilter, status: "Paid" } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" }
          },
          count: { $sum: 1 },
          total: { $sum: "$amount" }
        }
      },
      { $sort: { "_id.year": -1, "_id.month": -1, "_id.day": -1 } },
      { $limit: 30 }
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
        successRate: `${successRate}%`
      },
      byPaymentMethod: byPaymentMethod.map(item => ({
        method: item._id || "unknown",
        count: item.count,
        total: item.total || 0
      })),
      byVendorType: byVendorType.map(item => ({
        vendorType: item._id || "unknown",
        count: item.count,
        total: item.total || 0
      })),
      timeBreakdown: timeBreakdown.map(item => ({
        date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
        count: item.count,
        total: item.total || 0
      }))
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
  const now = moment();

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
          status: "Paid",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const lastYearEarnings = await Payment.aggregate([
      {
        $match: {
          ...vendorFilter,
          createdAt: {
            $gte: startOfLastYear.toDate(),
            $lte: endOfLastYear.toDate(),
          },
          status: "Paid",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // Weekly Earnings
    const thisWeekEarnings = await Payment.aggregate([
      {
        $match: {
          ...vendorFilter,
          createdAt: { $gte: startOfThisWeek.toDate() },
          status: "Paid",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const lastWeekEarnings = await Payment.aggregate([
      {
        $match: {
          ...vendorFilter,
          createdAt: {
            $gte: startOfLastWeek.toDate(),
            $lte: endOfLastWeek.toDate(),
          },
          status: "Paid",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // Completed Payments
    const completedThisWeek = await Payment.countDocuments({
      ...vendorFilter,
      status: "Paid",
      createdAt: { $gte: startOfThisWeek.toDate() },
    });

    const completedLastWeek = await Payment.countDocuments({
      ...vendorFilter,
      status: "Paid",
      createdAt: {
        $gte: startOfLastWeek.toDate(),
        $lte: endOfLastWeek.toDate(),
      },
    });

    // Pending Payments
    const pendingThisWeek = await Payment.countDocuments({
      ...vendorFilter,
      status: "Pending",
      createdAt: { $gte: startOfThisWeek.toDate() },
    });

    const pendingLastWeek = await Payment.countDocuments({
      ...vendorFilter,
      status: "Pending",
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
      { $match: { ...vendorFilter, status: "success", isSplitPayment: true } },
      { $group: { _id: null, total: { $sum: "$amountPaid" } } },
    ]);

    const totalEarningsUntilLastWeek = await Payment.aggregate([
      {
        $match: {
          ...vendorFilter,
          status: "success",
          isSplitPayment: true,
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
      totalEarnings: totalEarningsValue,
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
      roomId,
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
    if (
      reservationType === "hotel" &&
      (!checkInDate || !checkOutDate || !guests || !roomId)
    ) {
      return res.status(400).json({
        message: "Missing hotel required fields",
      });
    }
    if (reservationType === "club" && (!date || !time || !guests || !drinks)) {
      return res.status(400).json({
        message: "Missing club required fields",
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

      if (reservationType === "hotel" && roomId) {
        const room = await RoomType.findById(roomId);
        if (!room) throw new Error("Room not found");

        const nights = Math.ceil(
          (new Date(checkOutDate) - new Date(checkInDate)) /
            (1000 * 60 * 60 * 24),
        );
        totalAmount =
          (room.pricePerNight - room.pricePerNight * (room.discount / 100)) *
          nights;
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
        totalAmount /= 2
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
          checkInDate,
          checkOutDate,
          guests,
          roomId,
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

    const paystackResponse = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: customerEmail,
        amount: totalAmount * 100,
        reference: payment._id.toString(),
        callback_url: `${process.env.FRONTEND_URL}/${reservationType.split("R")[0]}s/confirmation/${payment._id}`,
        metadata: {
          paymentId: payment._id,
          customerId: req.user._id,
          reservationType,
          payLater,
        },
        ...(!payLater && {
          subaccount: vendor.paymentDetails.subaccountCode,
        }),
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    await Payment.updateOne(
      { _id: payment._id },
      { paystackReference: paystackResponse.data.data.reference },
    );

    if (paystackResponse.status === false) {
      return res.status(500).json({ message: paystackResponse.message });
    }

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
        amountPaid: transaction.amount / 100,
        reference,
        payLater: transaction.metadata.payLater,
        status: "Paid",
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
      emitPaymentUpdate({
        type: "new_payment",
        paymentId: newTransaction._id,
        vendorId: vendorId,
        amount: amount,
        reference: reference,
        status: "Paid",
        createdAt: newTransaction.createdAt,
      });
    }

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