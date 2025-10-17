import Payment from "../models/payment.model.js";
import moment from "moment";
import { Vendor } from "../models/vendor.model.js";
import Booking from "../models/booking.model.js";
import Payout from "../models/payout.model.js";
import Vendor from "../models/vendor.model.js";
import BankAccount from "../models/bankaccount.model.js";
import PaymentTransaction from "../models/paymenttransaction.model.js";
import { recordAuditLog } from "../utils/auditLogger.js";
import pkg from "json-2-csv";
import * as XLSX from "xlsx";

const { AsyncParser } = pkg;

// @desc    Get vendor earnings overview
// @route   GET /api/payments/vendor-earnings
// @access  Private (Finance, Ops)
export const getVendorEarnings = async (req, res) => {
  try {
    const { vendorId } = req.params;

    // Total earnings (sum of successful transactions minus commissions)
    const totalEarnings = await PaymentTransaction.aggregate([
      { $match: { status: "succeeded" } },
      {
        $lookup: {
          from: "reservations",
          localField: "booking",
          foreignField: "_id",
          as: "reservation",
        },
      },
      { $unwind: "$reservation" },
      { $match: { "reservation.vendor": vendorId } },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    // This week's earnings
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const weekEarnings = await PaymentTransaction.aggregate([
      { $match: { status: "succeeded", createdAt: { $gte: weekStart } } },
      {
        $lookup: {
          from: "reservations",
          localField: "booking",
          foreignField: "_id",
          as: "reservation",
        },
      },
      { $unwind: "$reservation" },
      { $match: { "reservation.vendor": vendorId } },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    // Today's earnings
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEarnings = await PaymentTransaction.aggregate([
      { $match: { status: "succeeded", createdAt: { $gte: todayStart } } },
      {
        $lookup: {
          from: "reservations",
          localField: "booking",
          foreignField: "_id",
          as: "reservation",
        },
      },
      { $unwind: "$reservation" },
      { $match: { "reservation.vendor": vendorId } },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    // Completed payments (payouts)
    const completedPayments = await Payout.countDocuments({
      vendor: vendorId,
      status: "completed",
    });

    // Available balance (total earnings minus payouts)
    const totalPayouts = await Payout.aggregate([
      { $match: { vendor: vendorId, status: "completed" } },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    const availableBalance =
      (totalEarnings[0]?.total || 0) - (totalPayouts[0]?.total || 0);

    res.status(200).json({
      totalEarnings: totalEarnings[0]?.total || 0,
      weekEarnings: weekEarnings[0]?.total || 0,
      todayEarnings: todayEarnings[0]?.total || 0,
      completedPayments,
      availableBalance,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Initiate payout
// @route   POST /api/payments/payout
// @access  Private (Finance)
export const initiatePayout = async (req, res) => {
  try {
    const { vendorId, amount, notes } = req.body;

    // Check vendor balance
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    if (vendor.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // Check bank account
    const bankAccount = await BankAccount.findOne({ vendor: vendorId, isVerified: true });
    if (!bankAccount) {
      return res.status(400).json({ message: "No verified bank account" });
    }

    // Create payout record
    const payout = new Payout({
      vendor: vendorId,
      amount,
      initiatedBy: req.user._id,
      notes,
    });

    await payout.save();

    // Deduct from vendor balance
    vendor.balance -= amount;
    await vendor.save();

    // TODO: Integrate with payment provider (e.g., Flutterwave, Paystack)

    await recordAuditLog(req.user._id, "PAYOUT_INITIATED", "Payout", payout._id, {
      initiatedBy: req.user._id,
      amount,
      vendor: vendorId,
    });

    res.status(201).json(payout);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get payout history
// @route   GET /api/payments/payouts
// @access  Private (Finance, Ops)
export const getPayouts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      vendor,
      status,
      sortBy,
      sortOrder,
    } = req.query;

    const query = {};
    if (vendor) query.vendor = vendor;
    if (status) query.status = status;

    const sort = {};
    if (sortBy) {
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;
    } else {
      sort.createdAt = -1;
    }

    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sort,
      populate: [
        { path: "vendor", select: "businessName email" },
        { path: "initiatedBy", select: "name" },
        { path: "approvedBy", select: "name" },
      ],
    };

    const payouts = await Payout.paginate(query, options);
    res.status(200).json(payouts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Approve payout
// @route   PATCH /api/payments/payouts/:id/approve
// @access  Private (Finance)
export const approvePayout = async (req, res) => {
  try {
    const payout = await Payout.findById(req.params.id);
    if (!payout) {
      return res.status(404).json({ message: "Payout not found" });
    }

    if (payout.status !== "pending") {
      return res.status(400).json({ message: "Payout already processed" });
    }

    payout.approvedBy = req.user._id;
    await payout.save();

    // TODO: Process payout with payment provider

    await recordAuditLog(req.user._id, "PAYOUT_APPROVED", "Payout", payout._id, {
      approvedBy: req.user._id,
    });

    res.status(200).json(payout);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Export payouts
// @route   GET /api/payments/payouts/export
// @access  Private (Finance, Ops)
export const exportPayouts = async (req, res) => {
  try {
    const payouts = await Payout.find()
      .populate("vendor", "businessName email")
      .populate("initiatedBy", "name")
      .populate("approvedBy", "name");

    const dataToExport = payouts.map((payout) => ({
      id: payout._id,
      vendorName: payout.vendor?.businessName || "",
      vendorEmail: payout.vendor?.email || "",
      amount: payout.amount,
      status: payout.status,
      initiatedBy: payout.initiatedBy?.name || "",
      approvedBy: payout.approvedBy?.name || "",
      paidAt: payout.paidAt,
      createdAt: payout.createdAt,
    }));

    const { format = "csv" } = req.query;

    if (format === "xlsx") {
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Payouts");
      const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      res.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.attachment("payouts.xlsx");
      return res.send(xlsxBuffer);
    } else {
      const parser = new AsyncParser();
      const csv = await parser.parse(dataToExport);

      res.header("Content-Type", "text/csv");
      res.attachment("payouts.csv");
      return res.send(csv);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get downloadable payout receipt
// @route   GET /api/payments/payouts/:id/receipt
// @access  Private (Finance, Ops)
export const getPayoutReceipt = async (req, res) => {
  try {
    const payout = await Payout.findById(req.params.id)
      .populate("vendor", "businessName email")
      .populate("initiatedBy", "name")
      .populate("approvedBy", "name");

    if (!payout) {
      return res.status(404).json({ message: "Payout not found" });
    }

    // Generate PDF receipt (using pdfGenerator utility)
    const receiptData = {
      payoutId: payout._id,
      vendorName: payout.vendor.businessName,
      amount: payout.amount,
      status: payout.status,
      initiatedBy: payout.initiatedBy.name,
      approvedBy: payout.approvedBy?.name || "N/A",
      paidAt: payout.paidAt,
      createdAt: payout.createdAt,
    };

    res.status(200).json(receiptData); // Placeholder
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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

export const initializePayment = async (req, res) => {
  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
  try {
    if (!req.user || !req.user._id) {
      return res
        .status(403)
        .json({ message: "Unauthorized: No User ID found" });
    }

    const { amount, email, vendorId, bookingId, customer_name } = req.body;

    if (!amount || !email || !vendorId) {
      return res
        .status(400)
        .json({ message: "Amount and email are required." });
    }

    if (!PAYSTACK_SECRET_KEY) {
      return res
        .status(500)
        .json({ message: "Paystack secret key not configured." });
    }

    // const paymentData = {
    //   amount: amount * 100, // Paystack expects the amount in kobo
    //   email: email,
    //   currency: "NGN",
    // };
    const vendor = await Vendor.findById(vendorId);
    if (!vendor || !vendor.paymentDetails || !vendor.paymentDetails.subaccountCode) {
      return res.status(404).json({ message: "Vendor not found." });
    }

    const paymentData = {
      email: email,
      amount: amount * 100,
      currency: "NGN",
      subaccount: vendor.paymentDetails.subaccountCode, // vendor's subaccount
      callback_url: `https://rhace-frontend.vercel.app/confirmation`,
      metadata: {
        vendorId,
        // bookingId,
        customer_name,
        userId: req.user.id
      }
    }


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
        messaage: "success",
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

export const verifyPayment = async (req, res) => {
  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
  const userId = req.user?._id;
  try {
    if (!req.user || !req.user._id) {
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
        }
      );

      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }

      const responseData = await response.json();
      return responseData;
    };

    const paystackResponse = await verifyPaymentOnPaystack(reference);

    if (paystackResponse.status === false) {
      return res.status(500).json({ message: paystackResponse.message });
    }

    // res.status(200).json({message: "Succesful", data: paystackResponse.data});

    const transaction = paystackResponse.data;
    if (transaction.status !== "success") {
      return res.status(400).json({ message: "Payment not successful." });
    }

    if (userId !== transaction.metadata.userId) {
      return res
        .status(400)
        .json({ message: "Unauthorized: User Id is missing from metadata" });
    }

    const vendorId = transaction.metadata?.vendorId;
    if (!vendorId) {
      return res
        .status(400)
        .json({ message: "vendor ID is missing from metadata." });
    }

    const existingTransaction = await Payment.findOne({ reference });

    if (transaction.status === "success" && !existingTransaction) {

      const newTransactionRecord = new Payment({
        email: transaction.metadata.email,
        customer_name: transaction.customer.customer_name,
        vendor: transaction.metadata.vendorId,
        booking: transaction.metadata.bookingId,
        amount: transaction.amount,
        reference: reference,
        status: "Paid",
      });

      await newTransactionRecord.save();
    }

    const booking = await Booking.findById(transaction.metadata.bookingId)

    // Log or save split details if needed
    return res.status(200).json({
      message: "Transaction verified",
      status: transaction.status,
      transactionId: transaction.id,
      amount: transaction.metadata.amount,
      currency: transaction.currency,
      paid_at: transaction.paid_at,
      bookingId: transaction.metadata.bookingId,
      vendorId: transaction.metadata.vendorId,
      cerated_at: transaction.created_at,
      channel: transaction.channel,
      customer: {
        id: transaction.customer.id,
        email: transaction.customer.email,
        customer_code: transaction.customer.customer_code,
      },
      booking
    });
  } catch (error) {
    console.error("Error Verifying Payment:", error);

    res.status(500).json({
      message: "Error Verifying Payment",
      error: error.message || "Unknown server error",
    });
  }
};
