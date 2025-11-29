import PaymentTransaction from "../models/paymenttransaction.model.js";
import Booking from "../models/booking.model.js"; // Needed for linking
import Hotel from "../models/hotel.model.js"; // Import Hotel model
import { recordAuditLog } from "../utils/auditLogger.js";

// @desc    Create a new payment transaction for a booking
// @route   POST /api/bookings/:bookingId/transactions
// @access  Private
export const createPaymentTransaction = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const paymentTransaction = new PaymentTransaction({
      ...req.body,
      booking: bookingId,
    });
    await paymentTransaction.save();
    recordAuditLog(req.user._id, "CREATE_PAYMENT_TRANSACTION", "PaymentTransaction", paymentTransaction._id, paymentTransaction.toObject());

    // Update booking payment status
    if (paymentTransaction.status === "succeeded") {
      const allTransactions = await PaymentTransaction.find({ booking: bookingId, status: "succeeded" });
      const totalPaid = allTransactions.reduce((acc, trans) => acc + trans.amount, 0);

      if (totalPaid >= booking.totalAmount) {
        booking.paymentStatus = "fully-paid";
      } else {
        booking.paymentStatus = "partly-paid";
      }
      await booking.save();
    }

    res.status(201).json(paymentTransaction);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all payment transactions for a booking with filters and pagination
// @route   GET /api/bookings/:bookingId/transactions
// @access  Private
export const getPaymentTransactions = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    const { page = 1, limit = 1000, search, status, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    let query = { booking: bookingId };

    if (search) {
      query.$or = [
        { method: { $regex: search, $options: "i" } },
        { providerRef: { $regex: search, $options: "i" } },
      ];
    }

    if (status) {
      query.status = status;
    }

    const totalTransactions = await PaymentTransaction.countDocuments(query);
    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const paymentTransactions = await PaymentTransaction.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.status(200).json({
      total: totalTransactions,
      page: parseInt(page),
      limit: parseInt(limit),
      paymentTransactions,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get a single payment transaction by ID
// @route   GET /api/payments/:id
// @access  Private
export const getPaymentTransactionById = async (req, res) => {
  try {
    const transaction = await PaymentTransaction.findById(req.params.id).populate("booking");
    if (transaction) {
      res.status(200).json(transaction);
    } else {
      res.status(404).json({ message: "Payment transaction not found" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get earnings for the user (total revenue from completed transactions)
// @route   GET /api/payments/earnings
// @access  Private
export const getEarnings = async (req, res) => {
  try {
    const userId = req.user._id;
    const { period = "all" } = req.query; // e.g., "week", "month", "year", "all"

    const hotels = await Hotel.find({ createdBy: userId });
    const hotelIds = hotels.map(h => h._id);

    let matchQuery = { status: "succeeded" };

    const now = new Date();
    if (period === "week") {
      const lastWeek = new Date(now.setDate(now.getDate() - 7));
      matchQuery.createdAt = { $gte: lastWeek };
    } else if (period === "month") {
      const lastMonth = new Date(now.setMonth(now.getMonth() - 1));
      matchQuery.createdAt = { $gte: lastMonth };
    }
    else if (period === "year") {
      const lastYear = new Date(now.setFullYear(now.getFullYear() - 1));
      matchQuery.createdAt = { $gte: lastYear };
    }

    const earnings = await PaymentTransaction.aggregate([
      { $match: { ...matchQuery, hotel: { $in: hotelIds } } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const totalEarnings = earnings.length > 0 ? earnings[0].total : 0;
    res.status(200).json({ totalEarnings });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get transaction history for the user with filters and pagination
// @route   GET /api/payments/history
// @access  Private
export const getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 10, search, status, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    const hotels = await Hotel.find({ createdBy: userId });
    const hotelIds = hotels.map(h => h._id);

    let query = { hotel: { $in: hotelIds } };

    if (search) {
      query.$or = [
        { method: { $regex: search, $options: "i" } },
        { providerRef: { $regex: search, $options: "i" } },
      ];
    }

    if (status) {
      query.status = status;
    }

    const totalTransactions = await PaymentTransaction.countDocuments(query);
    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const transactions = await PaymentTransaction.find(query)
      .populate("booking", "bookingCode")
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.status(200).json({
      total: totalTransactions,
      page: parseInt(page),
      limit: parseInt(limit),
      transactions,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a payout request
// @route   POST /api/payments/payout
// @access  Private
export const createPayout = async (req, res) => {
  try {
    const { amount, bankAccount } = req.body;
    // For now, we will just log it; in real implementation, integrate with payment gateway
    // Assume Payout model exists or create one
    const payout = {
      user: req.user._id,
      amount,
      bankAccount,
      status: "pending",
      createdAt: new Date()
    };
    // Save to DB if model exists
    res.status(201).json({ message: "Payout request submitted", payout });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Dispute a transaction
// @route   POST /api/payments/:id/dispute
// @access  Private
export const disputeTransaction = async (req, res) => {
  try {
    const transaction = await PaymentTransaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }
    // Add dispute logic
    transaction.status = "disputed";
    await transaction.save();
    res.status(200).json({ message: "Transaction disputed", transaction });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mark a transaction as settled
// @route   PATCH /api/payments/:id/settle
// @access  Private
export const markAsSettled = async (req, res) => {
  try {
    const transaction = await PaymentTransaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }
    if (transaction.status === "succeeded") {
      return res.status(400).json({ message: "Transaction is already succeeded." });
    }
    transaction.status = "succeeded"; // Assuming settled means succeeded
    await transaction.save();
    recordAuditLog(req.user._id, "MARK_TRANSACTION_SETTLED", "PaymentTransaction", transaction._id, { status: "succeeded" });
    res.status(200).json({ message: "Transaction marked as settled", transaction });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
