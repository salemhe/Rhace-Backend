import {
  checkRoomAvailability,
  checkTableAvailability,
  checkRestaurantCapacity,
  getRoomAvailabilityCalendar,
  getTableAvailabilityForDate,
  checkMultipleRoomsAvailability,
  checkMultipleTablesAvailability,
  calculateMultiRoomPrice,
  calculateMultiTablePrice
} from "../services/availability.service.js";
import { atomicCreateHotelBooking, atomicCreateClubBooking } from "../services/atomicBooking.service.js";

// @desc    Universal availability check endpoint
// @route   POST /api/availability/check
// @access  Private
export const checkUniversalAvailability = async (req, res) => {
  try {
    const { type, resourceId, date, checkInDate, checkOutDate, time, quantity = 1 } = req.body;

    if (!type || !resourceId) {
      return res.status(400).json({ message: "type and resourceId are required" });
    }

    let result;
    switch (type.toLowerCase()) {
      case "hotel":
      case "room":
        if (!checkInDate || !checkOutDate) {
          return res.status(400).json({ message: "checkInDate and checkOutDate are required" });
        }
        result = await checkRoomAvailability(resourceId, checkInDate, checkOutDate, quantity);
        break;
      case "club":
      case "table":
        if (!date || !time) {
          return res.status(400).json({ message: "date and time are required" });
        }
        result = await checkTableAvailability(resourceId, date, time, quantity);
        break;
      case "restaurant":
        if (!date || !time || !quantity) {
          return res.status(400).json({ message: "date, time, and partySize are required" });
        }
        result = await checkRestaurantCapacity(resourceId, date, time, quantity);
        break;
      default:
        return res.status(400).json({ message: "Invalid type. Use: hotel, club, or restaurant" });
    }

    res.status(200).json({ success: true, type, resourceId, ...result });
  } catch (error) {
    console.error("Error checking universal availability:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Check room availability for hotel booking
// @route   POST /api/availability/hotel
// @access  Private
export const checkRoomAvailabilityController = async (req, res) => {
  try {
    const { roomTypeId, checkInDate, checkOutDate, quantity = 1, excludeBookingId } = req.body;

    if (!roomTypeId || !checkInDate || !checkOutDate) {
      return res.status(400).json({ message: "roomTypeId, checkInDate, and checkOutDate are required" });
    }

    const result = await checkRoomAvailability(roomTypeId, checkInDate, checkOutDate, quantity, excludeBookingId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error checking room availability:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Check multiple rooms availability
// @route   POST /api/availability/hotel/multiple
// @access  Private
export const checkMultipleRoomsAvailabilityController = async (req, res) => {
  try {
    const { rooms, checkInDate, checkOutDate, excludeBookingId } = req.body;

    if (!rooms || rooms.length === 0) {
      return res.status(400).json({ message: "rooms array is required" });
    }

    if (!checkInDate || !checkOutDate) {
      return res.status(400).json({ message: "checkInDate and checkOutDate are required" });
    }

    const result = await checkMultipleRoomsAvailability(rooms, checkInDate, checkOutDate, excludeBookingId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error checking multiple rooms availability:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Calculate multi-room price
// @route   POST /api/availability/hotel/calculate-price
// @access  Private
export const calculateMultiRoomPriceController = async (req, res) => {
  try {
    const { rooms, checkInDate, checkOutDate } = req.body;

    if (!rooms || rooms.length === 0) {
      return res.status(400).json({ message: "rooms array is required" });
    }

    if (!checkInDate || !checkOutDate) {
      return res.status(400).json({ message: "checkInDate and checkOutDate are required" });
    }

    const result = await calculateMultiRoomPrice(rooms, checkInDate, checkOutDate);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error calculating room price:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Check table availability for club
// @route   POST /api/availability/club
// @access  Private
export const checkTableAvailabilityController = async (req, res) => {
  try {
    const { tableTypeId, date, time, quantity = 1, excludeBookingId } = req.body;

    if (!tableTypeId || !date || !time) {
      return res.status(400).json({ message: "tableTypeId, date, and time are required" });
    }

    const result = await checkTableAvailability(tableTypeId, date, time, quantity, excludeBookingId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error checking table availability:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Check multiple tables availability
// @route   POST /api/availability/club/multiple
// @access  Private
export const checkMultipleTablesAvailabilityController = async (req, res) => {
  try {
    const { tables, date, time, excludeBookingId } = req.body;

    if (!tables || tables.length === 0) {
      return res.status(400).json({ message: "tables array is required" });
    }

    if (!date || !time) {
      return res.status(400).json({ message: "date and time are required" });
    }

    const result = await checkMultipleTablesAvailability(tables, date, time, excludeBookingId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error checking multiple tables availability:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Calculate multi-table price
// @route   POST /api/availability/club/calculate-price
// @access  Private
export const calculateMultiTablePriceController = async (req, res) => {
  try {
    const { tables } = req.body;

    if (!tables || tables.length === 0) {
      return res.status(400).json({ message: "tables array is required" });
    }

    const result = await calculateMultiTablePrice(tables);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error calculating table price:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Check restaurant capacity
// @route   POST /api/availability/restaurant
// @access  Private
export const checkRestaurantCapacityController = async (req, res) => {
  try {
    const { vendorId, date, time, partySize, excludeBookingId } = req.body;

    if (!vendorId || !date || !time || !partySize) {
      return res.status(400).json({ message: "vendorId, date, time, and partySize are required" });
    }

    const result = await checkRestaurantCapacity(vendorId, date, time, partySize, excludeBookingId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error checking restaurant capacity:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get room availability calendar
// @route   GET /api/availability/hotel/:roomTypeId
// @access  Private
export const getRoomAvailabilityCalendarController = async (req, res) => {
  try {
    const { roomTypeId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: "startDate and endDate query parameters are required" });
    }

    const result = await getRoomAvailabilityCalendar(roomTypeId, startDate, endDate);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error getting room availability calendar:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get table availability for date
// @route   GET /api/availability/club/:tableTypeId/:date
// @access  Private
export const getTableAvailabilityForDateController = async (req, res) => {
  try {
    const { tableTypeId, date } = req.params;
    const result = await getTableAvailabilityForDate(tableTypeId, date);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error getting table availability:", error);
    res.status(500).json({ message: error.message });
  }
};
