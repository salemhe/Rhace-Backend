import express from "express";
import {
  createReservation,
  createMultiRoomReservation,
  createMultiTableReservation,
  getBookingSummary,
  getReservations,
  getReservationStats,
  completePayment,
  // Confirmation endpoints
  generateQRConfirmationToken,
  verifyQRCode,
  confirmReservation,
  confirmByQRCode,
  getConfirmationStatus,
} from "../controllers/booking.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Existing routes
router.post("/create", protect, createReservation)

router.post("/create-multi-room", protect, createMultiRoomReservation)

router.post("/create-multi-table", protect, createMultiTableReservation)

router.post("/complete-payment", protect, completePayment)

router.get("/", protect, getReservations)

router.get("/stats", protect, getReservationStats)

router.get("/summary", protect, getBookingSummary)

// ============================================
// RESERVATION CONFIRMATION SYSTEM
// ============================================

// @desc    Generate QR confirmation token for a booking
// @route   POST /api/bookings/:id/generate-qr-token
// @access  Private (Vendor, Admin)
router.post("/:id/generate-qr-token", protect, generateQRConfirmationToken);

// @desc    Verify QR code before confirmation
// @route   GET /api/bookings/verify-qr/:token
// @access  Private (Vendor, Admin)
router.get("/verify-qr/:token", protect, verifyQRCode);

// @desc    Manual confirmation by vendor from dashboard
// @route   POST /api/bookings/:id/confirm
// @access  Private (Vendor, Admin)
router.post("/:id/confirm", protect, confirmReservation);

// @desc    QR code confirmation - vendor scans user's QR code
// @route   POST /api/bookings/confirm-by-qr
// @access  Private (Vendor, Admin)
router.post("/confirm-by-qr", protect, confirmByQRCode);

// @desc    Get confirmation status for a booking
// @route   GET /api/bookings/:id/confirmation-status
// @access  Private
router.get("/:id/confirmation-status", protect, getConfirmationStatus);

export default router;
