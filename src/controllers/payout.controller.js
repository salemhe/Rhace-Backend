import Payout from "../models/payout.model.js";
import Vendor from "../models/vendor.model.js";

// @desc   Initiate a new payout for a vendor
// @route  POST /api/payouts
// @access Private (Finance role)
export const initiatePayout = async (req, res, next) => {
  const { vendorId, amount, notes } = req.body;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Validation
    if (!vendorId || !amount) {
      return res.status(400).json({ message: "Vendor ID and amount are required." });
    }

    if (parseFloat(amount) <= 0) {
      return res.status(400).json({ message: "Payout amount must be positive." });
    }

    const vendor = await Vendor.findById(vendorId).session(session);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found." });
    }

    if (vendor.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance for this payout." });
    }

    // 2. Update Vendor Balance
    vendor.balance -= amount;
    await vendor.save({ session });

    // 3. Create Payout Record
    const payout = new Payout({
      vendor: vendorId,
      amount,
      notes,
      initiatedBy: req.user.id, // Assuming user ID is available from 'protect' middleware
      status: "pending",
    });
    await payout.save({ session });

    // 4. Commit Transaction
    await session.commitTransaction();

    res.status(201).json({ success: true, data: payout });

  } catch (error) {
    await session.abortTransaction();
    next(error); // Pass error to global error handler
  } finally {
    session.endSession();
  }
};

// @desc   Get all payouts
// @route  GET /api/payouts
// @access Private (Finance, Admin)
export const getAllPayouts = async (req, res, next) => {
  res.status(501).json({ success: false, message: "Not Implemented" });
};

// @desc   Get a single payout by ID
// @route  GET /api/payouts/:id
// @access Private (Finance, Admin)
export const getPayoutById = async (req, res, next) => {
  res.status(501).json({ success: false, message: "Not Implemented" });
};

// @desc   Approve a pending payout
// @route  PATCH /api/payouts/:id/approve
// @access Private (Senior Finance, Admin)
export const approvePayout = async (req, res, next) => {
  res.status(501).json({ success: false, message: "Not Implemented" });
};

// @desc   Get all payouts for a specific vendor
// @route  GET /api/payouts/vendor/:vendorId
// @access Private (Finance, Admin)
export const getPayoutsForVendor = async (req, res, next) => {
  res.status(501).json({ success: false, message: "Not Implemented" });
};
