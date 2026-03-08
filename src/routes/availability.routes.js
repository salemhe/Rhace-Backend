import express from "express";
import { protect } from "../middlewares/auth.middleware.js";
import {
  checkUniversalAvailability,
  checkRoomAvailability as checkRoomAvailabilityController,
  checkTableAvailability as checkTableAvailabilityController,
  checkRestaurantCapacity as checkRestaurantCapacityController,
  getRoomAvailabilityCalendar as getRoomAvailabilityCalendarController,
  getTableAvailabilityForDate as getTableAvailabilityForDateController,
  checkMultipleRoomsAvailability as checkMultipleRoomsAvailabilityController,
  checkMultipleTablesAvailability as checkMultipleTablesAvailabilityController,
  calculateMultiRoomPriceController,
  calculateMultiTablePriceController
} from "../controllers/availability.controller.js";

const router = express.Router();

// ============================================
// UNIVERSAL AVAILABILITY CHECK
// ============================================

// @desc    Universal availability check (single endpoint for all types)
// @route   POST /api/availability/check
// @access  Public
router.post("/check", protect, checkUniversalAvailability);

// ============================================
// HOTEL AVAILABILITY
// ============================================

// @desc    Check room availability for hotel booking (single room)
// @route   POST /api/availability/hotel
// @access  Public
router.post("/hotel", protect, checkRoomAvailabilityController);

// @desc    Check multiple rooms availability for hotel booking
// @route   POST /api/availability/hotel/multiple
// @access  Public
router.post("/hotel/multiple", protect, checkMultipleRoomsAvailabilityController);

// @desc    Calculate multi-room price
// @route   POST /api/availability/hotel/calculate-price
// @access  Public
router.post("/hotel/calculate-price", protect, calculateMultiRoomPriceController);

// @desc    Get room availability calendar (date range)
// @route   GET /api/availability/hotel/:roomTypeId
// @access  Public
router.get("/hotel/:roomTypeId", protect, getRoomAvailabilityCalendarController);

// ============================================
// CLUB AVAILABILITY
// ============================================

// @desc    Check table availability for club booking (single table)
// @route   POST /api/availability/club
// @access  Public
router.post("/club", protect, checkTableAvailabilityController);

// @desc    Check multiple tables availability for club booking
// @route   POST /api/availability/club/multiple
// @access  Public
router.post("/club/multiple", protect, checkMultipleTablesAvailabilityController);

// @desc    Calculate multi-table price
// @route   POST /api/availability/club/calculate-price
// @access  Public
router.post("/club/calculate-price", protect, calculateMultiTablePriceController);

// @desc    Get table availability for specific date
// @route   GET /api/availability/club/:tableTypeId/:date
// @access  Public
router.get("/club/:tableTypeId/:date", protect, getTableAvailabilityForDateController);

// ============================================
// RESTAURANT AVAILABILITY
// ============================================

// @desc    Check restaurant capacity
// @route   POST /api/availability/restaurant
// @access  Public
router.post("/restaurant", protect, checkRestaurantCapacityController);

export default router;

