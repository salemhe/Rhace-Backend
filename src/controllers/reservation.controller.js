import Reservation from "../models/reservation.model.js";
import MealSelection from "../models/mealselection.model.js";
import NoShowPenalty from "../models/noshowpenalty.model.js";
import PaymentTransaction from "../models/paymenttransaction.model.js";
import { recordAuditLog } from "../utils/auditLogger.js";
import pkg from "json-2-csv";
import * as XLSX from "xlsx";

// Emit real-time updates for reservations
const emitReservationUpdate = (data) => {
  if (global.io) {
    global.io.to('admin_reservations').emit('reservation_update', data);
  }
};

const { AsyncParser } = pkg;

// @desc    Get all reservations with search, filter, sort, pagination
// @route   GET /api/reservations
// @access  Private (Admin, Ops)
export const getReservations = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 1000,
      search,
      status,
      paymentStatus,
      vendor,
      branch,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
    } = req.query;

    const query = {};

    if (search) {
      // Search by guest name or ID - populate guest
      query.$or = [
        { "guest.firstName": { $regex: search, $options: "i" } },
        { "guest.lastName": { $regex: search, $options: "i" } },
      ];
    }

    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (vendor) query.vendor = vendor;
    if (branch) query.branch = branch; // Note: branch field not in model, may need to add if required

    if (dateFrom || dateTo) {
      query.checkInDate = {};
      if (dateFrom) query.checkInDate.$gte = new Date(dateFrom);
      if (dateTo) query.checkInDate.$lte = new Date(dateTo);
    }

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
        { path: "vendor", select: "businessName vendorType" },
        { path: "tableType", select: "name capacity" },
        { path: "roomType", select: "name capacity" },
        { path: "guest", select: "firstName lastName email phone" },
        { path: "payment", select: "status amount" },
      ],
    };

    const reservations = await Reservation.paginate(query, options);

    // Add time badges and payment info
    const reservationsWithMeta = reservations.docs.map((reservation) => {
      const checkInTime = new Date(reservation.checkInDate);
      const now = new Date();
      const timeDiff = checkInTime - now;
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      let timeBadge = null;
      if (hoursDiff <= 1 && hoursDiff > 0) {
        timeBadge = "in 1 hour";
      } else if (hoursDiff <= 0.5 && hoursDiff > 0) {
        timeBadge = "in 30 mins";
      }

      return {
        ...reservation.toObject(),
        timeBadge,
        paymentStatus: reservation.payment?.status || "unpaid",
      };
    });

    res.status(200).json({
      ...reservations,
      docs: reservationsWithMeta,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single reservation by ID
// @route   GET /api/reservations/:id
// @access  Private (Admin, Ops)
export const getReservationById = async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id)
      .populate("vendor", "businessName vendorType")
      .populate("tableType", "name capacity")
      .populate("roomType", "name capacity")
      .populate("guest", "firstName lastName email phone")
      .populate("payment", "status amount method");

    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    // Get meal selections
    const mealSelections = await MealSelection.find({ reservation: req.params.id })
      .populate("menuItem", "name price category");

    // Get no-show penalty if exists
    const noShowPenalty = await NoShowPenalty.findOne({
      reservation: req.params.id,
      status: { $ne: "waived" },
    });

    res.status(200).json({
      ...reservation.toObject(),
      mealSelections,
      noShowPenalty,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update reservation status
// @route   PATCH /api/reservations/:id/status
// @access  Private (Admin, Ops)
export const updateReservationStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const reservation = await Reservation.findById(req.params.id);
    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    const oldStatus = reservation.status;
    reservation.status = status;
    await reservation.save();

    // If marked as no-show, create penalty
    if (status === "no-show") {
      const penaltyAmount = reservation.deposit || 50; // Default penalty or use deposit

      const penalty = new NoShowPenalty({
        reservation: req.params.id,
        guest: reservation.guest,
        amount: penaltyAmount,
      });
      await penalty.save();
    }

    await recordAuditLog(req.user._id, "RESERVATION_STATUS_UPDATE", "Reservation", reservation._id, {
      updatedBy: req.user._id,
      oldStatus,
      newStatus: status,
    });

    // Emit real-time update for reservation status change
    emitReservationUpdate({
      type: 'status_update',
      reservationId: reservation._id,
      oldStatus,
      newStatus: status,
      updatedBy: req.user._id,
    });

    res.status(200).json(reservation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add meal selection to reservation
// @route   POST /api/reservations/:id/meals
// @access  Private (Admin, Ops, Vendor)
export const addMealSelection = async (req, res) => {
  try {
    const { menuItem, quantity, specialInstructions } = req.body;

    // Get menu item price (assuming Menu model exists)
    const menuItemDoc = await Menu.findById(menuItem);
    if (!menuItemDoc) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    const mealSelection = new MealSelection({
      reservation: req.params.id,
      menuItem,
      quantity,
      specialInstructions,
      price: menuItemDoc.price,
    });

    await mealSelection.save();
    res.status(201).json(mealSelection);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Waive no-show penalty
// @route   PATCH /api/reservations/:id/penalty/waive
// @access  Private (Admin)
export const waiveNoShowPenalty = async (req, res) => {
  try {
    const { waiverReason } = req.body;

    const penalty = await NoShowPenalty.findOne({
      reservation: req.params.id,
      status: "pending",
    });

    if (!penalty) {
      return res.status(404).json({ message: "No pending penalty found" });
    }

    penalty.status = "waived";
    penalty.waivedBy = req.user._id;
    penalty.waiverReason = waiverReason;
    await penalty.save();

    await recordAuditLog(req.user._id, "PENALTY_WAIVED", "Reservation", req.params.id, {
      waivedBy: req.user._id,
      waiverReason,
    });

    res.status(200).json(penalty);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get reservation counters
// @route   GET /api/reservations/counters
// @access  Private (Admin, Ops)
export const getReservationCounters = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const reservationsToday = await Reservation.countDocuments({
      createdAt: { $gte: today, $lt: tomorrow },
    });

    const prepaidReservations = await Reservation.countDocuments({
      payment: { $exists: true },
      "payment.status": "succeeded",
    });

    const expectedGuestsToday = await Reservation.aggregate([
      {
        $match: {
          checkInDate: { $gte: today, $lt: tomorrow },
          status: { $in: ["confirmed", "seated"] },
        },
      },
      {
        $group: {
          _id: null,
          totalGuests: { $sum: "$partySize" },
        },
      },
    ]);

    const pendingPayments = await Reservation.countDocuments({
      payment: { $exists: false },
      status: "confirmed",
    });

    res.status(200).json({
      reservationsToday,
      prepaidReservations,
      expectedGuestsToday: expectedGuestsToday[0]?.totalGuests || 0,
      pendingPayments,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Export reservations to CSV/XLSX
// @route   GET /api/reservations/export
// @access  Private (Admin, Ops)
export const exportReservations = async (req, res) => {
  try {
    const reservations = await Reservation.find()
      .populate("vendor", "businessName vendorType")
      .populate("tableType", "name")
      .populate("roomType", "name")
      .populate("guest", "firstName lastName email phone")
      .populate("payment", "status amount method");

    const dataToExport = reservations.map((reservation) => ({
      id: reservation._id,
      vendorName: reservation.vendor?.businessName || "",
      vendorType: reservation.vendor?.vendorType || "",
      tableType: reservation.tableType?.name || "",
      roomType: reservation.roomType?.name || "",
      guestName: `${reservation.guest?.firstName || ""} ${reservation.guest?.lastName || ""}`,
      guestEmail: reservation.guest?.email || "",
      guestPhone: reservation.guest?.phone || "",
      checkInDate: reservation.checkInDate,
      checkOutDate: reservation.checkOutDate,
      partySize: reservation.partySize,
      status: reservation.status,
      paymentStatus: reservation.payment?.status || "unpaid",
      paymentAmount: reservation.payment?.amount || 0,
      paymentMethod: reservation.payment?.method || "",
      createdAt: reservation.createdAt,
    }));

    const { format = "csv" } = req.query;

    if (format === "xlsx") {
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Reservations");
      const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      res.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.attachment("reservations.xlsx");
      return res.send(xlsxBuffer);
    } else {
      const parser = new AsyncParser();
      const csv = await parser.parse(dataToExport);

      res.header("Content-Type", "text/csv");
      res.attachment("reservations.csv");
      return res.send(csv);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
