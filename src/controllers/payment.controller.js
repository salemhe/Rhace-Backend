import Payment from "../models/payment.model.js";
import moment from "moment";
import { Vendor } from "../models/vendor.model.js";

const percentChange = (current, previous) => {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
};

export const geBanks = async (req, res) => {
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
      }
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
    const userId = req.user._id;
    const payments = await Payment.find({ vendor: userId });

    return res.json(payments);
  } catch (error) {
    console.error("Error fetching payments:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getPaymentStats = async (req, res) => {
  const userId = req.user._id;
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
    // Yearly Earnings
    const thisYearEarnings = await Payment.aggregate([
      {
        $match: {
          vendor: userId,
          createdAt: { $gte: startOfThisYear.toDate() },
          status: "Paid",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const lastYearEarnings = await Payment.aggregate([
      {
        $match: {
          vendor: userId,
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
          vendor: userId,
          createdAt: { $gte: startOfThisWeek.toDate() },
          status: "Paid",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const lastWeekEarnings = await Payment.aggregate([
      {
        $match: {
          vendor: userId,
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
      vendor: userId,
      status: "Paid",
      createdAt: { $gte: startOfThisWeek.toDate() },
    });

    const completedLastWeek = await Payment.countDocuments({
      vendor: userId,
      status: "Paid",
      createdAt: {
        $gte: startOfLastWeek.toDate(),
        $lte: endOfLastWeek.toDate(),
      },
    });

    // Pending Payments
    const pendingThisWeek = await Payment.countDocuments({
      vendor: userId,
      status: "Pending",
      createdAt: { $gte: startOfThisWeek.toDate() },
    });

    const pendingLastWeek = await Payment.countDocuments({
      vendor: userId,
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
          lastYearEarnings[0]?.total || 0
        ),

        thisWeek: thisWeekEarnings[0]?.total || 0,
        lastWeek: lastWeekEarnings[0]?.total || 0,
        weekChange: percentChange(
          thisWeekEarnings[0]?.total || 0,
          lastWeekEarnings[0]?.total || 0
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
  const startDate = moment().subtract(7, "weeks").startOf("isoWeek").toDate();
  const endOfLastWeek = moment().subtract(1, "weeks").endOf("isoWeek");

  try {
    const trends = await Payment.aggregate([
      {
        $match: {
          vendor: userId,
          createdAt: { $gte: startDate },
          status: "completed",
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          totalEarnings: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.year": 1, "_id.week": 1 } },
    ]);

    const totalEarnings = await Payment.aggregate([
      { $match: { vendor: userId, status: "completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const totalEarningsUntilLastWeek = await Payment.aggregate([
      {
        $match: {
          vendor: userId,
          status: "completed",
          createdAt: { $lte: endOfLastWeek.toDate() },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const totalEarningsValue = totalEarnings[0]?.total || 0;
    const totalUntilLastWeekValue = totalEarningsUntilLastWeek[0]?.total || 0;
    const percentChangeTotalToLastWeek = percentChange(
      totalEarningsValue,
      totalUntilLastWeekValue
    );

    return res.json({
      trends,
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
      "paymentDetails bankName accountNumber balance"
    );

    if (!user) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    const { paymentDetails, balance } = user;

    const response = await fetch(
      `https://nigerianbanks.xyz/?code=${paymentDetails?.bankCode}`
    );
    if (!response.ok) {
      console.error("Error fetching bank info:", await res.text());
      return res.status(500).json({ error: "Failed to fetch bank info" });
    }

    const data = await response.json();
    
    const maskedAccountNumber = paymentDetails?.accountNumber
      ? paymentDetails.accountNumber
          .slice(-4)
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
