import Payout from "../models/payout.model.js";
import { Vendor } from "../models/vendor.model.js";
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

    // TODO: Implement PDF generation
    // const pdfBuffer = await generatePayoutReceipt(receiptData);

    res.status(200).json(receiptData); // Placeholder
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
