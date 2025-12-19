import Payout from "../models/payout.model.js";
import { Vendor } from "../models/vendor.model.js";
import BankAccount from "../models/bankaccount.model.js";
import PaymentTransaction from "../models/paymenttransaction.model.js";
import { recordAuditLog } from "../utils/auditLogger.js";
import pkg from "json-2-csv";
import * as XLSX from "xlsx";
import Payment from "../models/payment.model.js";
import moment from "moment";
import { Booking } from "../models/booking.model.js";

// Emit real-time updates for payments
const emitPaymentUpdate = (data) => {
  if (global.io) {
    console.log('Emitting payment_update event:', data);
    global.io.to('admin_payments').emit('payment_update', data);
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
    let query = {};
    if (req.user.role !== "admin" && req.user.role === "vendor") {
      query.vendor = req.user._id;
    } else {
      query.user = req.user._id;
    }
    const payments = await Payment.find(query).sort({ createdAt: -1 }).populate("vendor");

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
  const isAdmin = req.user.role === "admin";
  const startDate = moment().subtract(7, "weeks").startOf("isoWeek").toDate();
  const endOfLastWeek = moment().subtract(1, "weeks").endOf("isoWeek");

  try {
    const vendorFilter = isAdmin ? {} : { vendor: userId };

    const trends = await Payment.aggregate([
      {
        $match: {
          ...vendorFilter,
          createdAt: { $gte: startDate },
          status: "Paid",
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
      { $sort: { "_id": 1 } },
    ]);

    const totalEarnings = await Payment.aggregate([
      { $match: { ...vendorFilter, status: "Paid" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const totalEarningsUntilLastWeek = await Payment.aggregate([
      {
        $match: {
          ...vendorFilter,
          status: "Paid",
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
      console.error("Error fetching bank info:", await response.text());
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

export const initializePayment = async (req, res) => {
  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
  try {
    if (!req.user || !req.user._id) {
      return res
        .status(403)
        .json({ message: "Unauthorized: No User ID found" });
    }

    const { amount, email, vendorId, bookingId, type, customerName } = req.body;

    if (!amount || !email || !vendorId || !type) {
      return res
        .status(400)
        .json({ message: "Amount and email are required." });
    }

    if (!PAYSTACK_SECRET_KEY) {
      return res
        .status(500)
        .json({ message: "Paystack secret key not configured." });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor || !vendor.paymentDetails || !vendor.paymentDetails.subaccountCode) {
      return res.status(404).json({ message: "Vendor not found." });
    }

    const paymentData = {
      email: email,
      amount: amount * 100,
      currency: "NGN",
      subaccount: vendor.paymentDetails.subaccountCode,
      callback_url: `https://rhace-frontend.vercel.app/${type.split("R")[0]}s/confirmation/${bookingId}`,
      metadata: {
        vendorId,
        bookingId,
        customerName,
        userId: req.user._id
      }
    };

    const createPaymentOnPaystack = async (data) => {
      const response = await fetch(
        "https://api.paystack.co/transaction/initialize",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }

      const responseData = await response.json();
      return responseData;
    };

    const paystackResponse = await createPaymentOnPaystack(paymentData);

    if (paystackResponse.status === false) {
      return res.status(500).json({ message: paystackResponse.message });
    }

    res
      .status(200)
      .json({
        message: "success",
        data: {
          authorization_url: paystackResponse.data.authorization_url,
          access_code: paystackResponse.data.access_code,
          ref: paystackResponse.data.reference,
        },
      });
  } catch (error) {
    console.error("Error Initializing Payment:", error);

    res.status(500).json({
      message: "Error Verifying Payment",
      error: error.message || "Unknown server error",
    });
  }
};

export const getVendorsEarnings = async (req, res) => {
  try {
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

export const verifyPayment = async (req, res) => {
  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
  const userId = req.user?._id;

  try {
    if (!req.user || !userId) {
      return res.status(403).json({ message: "Unauthorized: No User ID found" });
    }

    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({ message: "Reference is required." });
    }

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ message: "Paystack secret key not configured." });
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
        }
      );

      if (!response.ok) {
        throw new Error(`Paystack verification failed: ${response.statusText}`);
      }

      return await response.json();
    };

    const paystackResponse = await verifyPaymentOnPaystack(reference);

    if (!paystackResponse.status) {
      return res.status(500).json({ message: paystackResponse.message || "Verification failed" });
    }

    const transaction = paystackResponse.data;

    if (transaction.status !== "success") {
      return res.status(400).json({ message: "Payment not successful." });
    }

    if (String(userId) !== transaction.metadata?.userId) {
      return res.status(403).json({ message: "Unauthorized: Invalid User ID in metadata" });
    }

    const vendorId = transaction.metadata?.vendorId;
    if (!vendorId) {
      return res.status(400).json({ message: "Vendor ID is missing from metadata." });
    }

    const existingTransaction = await Payment.findOne({ reference });
    const amountInUSD = transaction.amount * 0.0092;

    if (!existingTransaction) {
      // Save the payment
      const newTransaction = new Payment({
        email: transaction.metadata.email,
        customer_name: transaction.metadata.customerName,
        paid_at: transaction.paid_at,
        vendor: vendorId,
        user: userId,
        booking: transaction.metadata.bookingId,
        paymentMethod: transaction.channel,
        amount: amountInUSD,
        reference,
        status: "Paid",
      });

      await newTransaction.save();

      // Update vendor balance
      const updatedVendor = await Vendor.findById(vendorId);
      if (updatedVendor) {
        updatedVendor.balance += amountInUSD;
        await updatedVendor.save();
      }

      // Emit real-time update for new payment
      emitPaymentUpdate({
        type: 'new_payment',
        paymentId: newTransaction._id,
        vendorId: vendorId,
        amount: amountInUSD,
        reference: reference,
        status: 'Paid',
        createdAt: newTransaction.createdAt,
      });
    }

    // Update booking payment status
    const booking = await Booking.findById(transaction.metadata.bookingId);
    if (booking) {
      booking.paymentStatus = transaction.status;
      await booking.save();
    }

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
      booking,
    });
  } catch (error) {
    console.error("Error Verifying Payment:", error);
    return res.status(500).json({
      message: "Error Verifying Payment",
      error: error.message || "Unknown server error",
    });
  }
};