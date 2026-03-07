import { Booking, hotelReservation, restaurantReservation, clubReservation } from "../models/booking.model.js";
import RoomType from "../models/roomtype.model.js";
import TableType from "../models/tableType.model.js";
import dayjs from "dayjs";

/**
 * Check room availability for hotels (supports multi-room booking)
 * @param {string} roomTypeId - Room type ID
 * @param {Date|string} checkInDate - Check-in date
 * @param {Date|string} checkOutDate - Check-out date
 * @param {number} requestedQuantity - Number of rooms requested (default: 1)
 * @param {string} excludeBookingId - Optional booking ID to exclude (for updates)
 */
export const checkRoomAvailability = async (roomTypeId, checkInDate, checkOutDate, requestedQuantity = 1, excludeBookingId = null) => {
  const roomType = await RoomType.findById(roomTypeId);
  if (!roomType) {
    return { available: false, reason: "Room type not found" };
  }

  const totalUnits = roomType.totalUnits;
  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);

  // Build query for overlapping bookings
  const bookingQuery = {
    room: roomTypeId,
    reservationStatus: { $nin: ["cancelled", "no_show"] },
    $or: [
      // New booking starts during existing booking
      {
        checkInDate: { $lt: checkOut },
        checkOutDate: { $gt: checkIn }
      }
    ]
  };

  // Exclude current booking if updating
  if (excludeBookingId) {
    bookingQuery._id = { $ne: excludeBookingId };
  }

  // Find all bookings that overlap with the requested dates
  const existingBookings = await hotelReservation.find(bookingQuery);
  
  // Calculate booked units for each date
  const bookedUnitsByDate = {};
  
  for (const booking of existingBookings) {
    const bookingCheckIn = new Date(booking.checkInDate);
    const bookingCheckOut = new Date(booking.checkOutDate);
    
    // Get quantity from booking (handle both single and multi-room bookings)
    const bookedQuantity = booking.rooms ? 
      booking.rooms.reduce((sum, r) => sum + (r.quantity || 1), 0) : 
      (booking.quantity || 1);
    
    // Iterate through each date in the range
    let currentDate = new Date(bookingCheckIn);
    while (currentDate < bookingCheckOut) {
      const dateKey = dayjs(currentDate).format("YYYY-MM-DD");
      bookedUnitsByDate[dateKey] = (bookedUnitsByDate[dateKey] || 0) + bookedQuantity;
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  // Check each date in the requested range
  let currentDate = new Date(checkIn);
  const unavailableDates = [];
  
  while (currentDate < checkOut) {
    const dateKey = dayjs(currentDate).format("YYYY-MM-DD");
    const bookedUnits = bookedUnitsByDate[dateKey] || 0;
    const availableUnits = totalUnits - bookedUnits;
    
    if (availableUnits < requestedQuantity) {
      unavailableDates.push({
        date: dateKey,
        bookedUnits,
        totalUnits,
        availableUnits,
        requestedUnits: requestedQuantity
      });
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }

  if (unavailableDates.length > 0) {
    return {
      available: false,
      reason: `Only ${Math.min(...unavailableDates.map(d => d.availableUnits))} rooms available for selected dates (requested: ${requestedQuantity})`,
      unavailableDates,
      totalUnits,
      bookedUnits: Math.max(...Object.values(bookedUnitsByDate), 0),
      requestedQuantity
    };
  }

  return {
    available: true,
    totalUnits,
    bookedUnits: Math.max(...Object.values(bookedUnitsByDate), 0),
    availableUnits: totalUnits - Math.max(...Object.values(bookedUnitsByDate), 0),
    requestedQuantity,
    canBook: requestedQuantity
  };
};

/**
 * Check multiple rooms availability for hotels
 * @param {Array} rooms - Array of { roomTypeId, quantity }
 * @param {Date|string} checkInDate - Check-in date
 * @param {Date|string} checkOutDate - Check-out date
 * @param {string} excludeBookingId - Optional booking ID to exclude
 */
export const checkMultipleRoomsAvailability = async (rooms, checkInDate, checkOutDate, excludeBookingId = null) => {
  if (!rooms || rooms.length === 0) {
    return { available: false, reason: "No rooms specified" };
  }

  const results = [];
  let allAvailable = true;
  const unavailableRooms = [];

  for (const roomItem of rooms) {
    const result = await checkRoomAvailability(
      roomItem.roomType,
      checkInDate,
      checkOutDate,
      roomItem.quantity,
      excludeBookingId
    );
    
    results.push({
      roomTypeId: roomItem.roomType,
      quantity: roomItem.quantity,
      ...result
    });

    if (!result.available) {
      allAvailable = false;
      unavailableRooms.push({
        roomTypeId: roomItem.roomType,
        quantity: roomItem.quantity,
        reason: result.reason,
        availableUnits: result.availableUnits
      });
    }
  }

  if (!allAvailable) {
    return {
      available: false,
      reason: "Some rooms not available for selected dates",
      unavailableRooms,
      results
    };
  }

  // Calculate totals
  const totalAvailable = Math.min(...results.map(r => r.availableUnits));
  const totalRequested = rooms.reduce((sum, r) => sum + r.quantity, 0);

  return {
    available: true,
    totalRooms: totalRequested,
    availableUnits: totalAvailable,
    results,
    breakdown: results.map(r => ({
      roomTypeId: r.roomTypeId,
      quantity: r.quantity,
      pricePerNight: r.pricePerNight,
      available: r.available
    }))
  };
};

/**
 * Check table availability for clubs (supports multi-table booking)
 * @param {string} tableTypeId - Table type ID
 * @param {Date|string} date - Booking date
 * @param {string} time - Booking time
 * @param {number} requestedQuantity - Number of tables requested (default: 1)
 * @param {string} excludeBookingId - Optional booking ID to exclude
 */
export const checkTableAvailability = async (tableTypeId, date, time, requestedQuantity = 1, excludeBookingId = null) => {
  const tableType = await TableType.findById(tableTypeId);
  if (!tableType) {
    return { available: false, reason: "Table type not found" };
  }

  const totalTables = tableType.quantityAvailable;
  const bookingDate = new Date(date);

  // Build query for same date and time
  const bookingQuery = {
    table: tableTypeId,
    date: {
      $gte: dayjs(bookingDate).startOf("day").toDate(),
      $lte: dayjs(bookingDate).endOf("day").toDate()
    },
    time: time,
    reservationStatus: { $nin: ["cancelled", "no_show"] }
  };

  if (excludeBookingId) {
    bookingQuery._id = { $ne: excludeBookingId };
  }

  const existingBookings = await clubReservation.find(bookingQuery);
  
  // Calculate total booked tables (handle both single and multi-table bookings)
  let bookedTables = 0;
  for (const booking of existingBookings) {
    if (booking.tables && booking.tables.length > 0) {
      bookedTables += booking.tables.reduce((sum, t) => sum + (t.quantity || 1), 0);
    } else {
      bookedTables += 1; // Single table booking
    }
  }
  
  const availableTables = totalTables - bookedTables;

  if (availableTables < requestedQuantity) {
    return {
      available: false,
      reason: `Only ${availableTables} tables available for ${dayjs(date).format("MMM DD, YYYY")} at ${time} (requested: ${requestedQuantity})`,
      date: dayjs(date).format("YYYY-MM-DD"),
      time,
      totalTables,
      bookedTables,
      availableTables,
      requestedQuantity
    };
  }

  return {
    available: true,
    date: dayjs(date).format("YYYY-MM-DD"),
    time,
    totalTables,
    bookedTables,
    availableTables,
    requestedQuantity,
    canBook: requestedQuantity
  };
};

/**
 * Check multiple tables availability for clubs
 * @param {Array} tables - Array of { tableTypeId, quantity }
 * @param {Date|string} date - Booking date
 * @param {string} time - Booking time
 * @param {string} excludeBookingId - Optional booking ID to exclude
 */
export const checkMultipleTablesAvailability = async (tables, date, time, excludeBookingId = null) => {
  if (!tables || tables.length === 0) {
    return { available: false, reason: "No tables specified" };
  }

  const results = [];
  let allAvailable = true;
  const unavailableTables = [];

  for (const tableItem of tables) {
    const result = await checkTableAvailability(
      tableItem.tableType,
      date,
      time,
      tableItem.quantity,
      excludeBookingId
    );
    
    results.push({
      tableTypeId: tableItem.tableType,
      quantity: tableItem.quantity,
      ...result
    });

    if (!result.available) {
      allAvailable = false;
      unavailableTables.push({
        tableTypeId: tableItem.tableType,
        quantity: tableItem.quantity,
        reason: result.reason,
        availableTables: result.availableTables
      });
    }
  }

  if (!allAvailable) {
    return {
      available: false,
      reason: "Some tables not available for selected date/time",
      unavailableTables,
      results
    };
  }

  // Calculate totals
  const totalAvailable = Math.min(...results.map(r => r.availableTables));
  const totalRequested = tables.reduce((sum, t) => sum + t.quantity, 0);

  return {
    available: true,
    totalTables: totalRequested,
    availableTables: totalAvailable,
    results,
    breakdown: results.map(r => ({
      tableTypeId: r.tableTypeId,
      quantity: r.quantity,
      pricePerTable: r.pricePerTable,
      available: r.available
    }))
  };
};

/**
 * Check restaurant capacity
 * @param {string} vendorId - Restaurant/Vendor ID
 * @param {Date|string} date - Booking date
 * @param {string} time - Booking time
 * @param {number} partySize - Number of guests
 * @param {string} excludeBookingId - Optional booking ID to exclude
 */
export const checkRestaurantCapacity = async (vendorId, date, time, partySize, excludeBookingId = null) => {
  // For restaurants, we check if the total guests for that time slot doesn't exceed capacity
  // This is a simplified version - you might want to add a capacity field to vendor or settings
  
  const bookingDate = new Date(date);
  
  const bookingQuery = {
    vendor: vendorId,
    reservationType: "restaurantReservation",
    date: {
      $gte: dayjs(bookingDate).startOf("day").toDate(),
      $lte: dayjs(bookingDate).endOf("day").toDate()
    },
    time: time,
    reservationStatus: { $nin: ["cancelled", "no_show"] }
  };

  if (excludeBookingId) {
    bookingQuery._id = { $ne: excludeBookingId };
  }

  const existingBookings = await restaurantReservation.find(bookingQuery);
  const totalGuests = existingBookings.reduce((sum, booking) => sum + (booking.guests || 0), 0);
  const newTotalGuests = totalGuests + partySize;

  // Default max capacity (can be customized via settings)
  const MAX_CAPACITY = 100; // This should come from settings in production

  if (newTotalGuests > MAX_CAPACITY) {
    return {
      available: false,
      reason: `Restaurant capacity reached for ${dayjs(date).format("MMM DD, YYYY")} at ${time}`,
      date: dayjs(date).format("YYYY-MM-DD"),
      time,
      currentGuests: totalGuests,
      partySize,
      maxCapacity: MAX_CAPACITY,
      availableCapacity: MAX_CAPACITY - totalGuests
    };
  }

  return {
    available: true,
    date: dayjs(date).format("YYYY-MM-DD"),
    time,
    currentGuests: totalGuests,
    partySize,
    maxCapacity: MAX_CAPACITY,
    availableCapacity: MAX_CAPACITY - newTotalGuests
  };
};

/**
 * Get availability calendar for a room type (for date range)
 * @param {string} roomTypeId - Room type ID
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 */
export const getRoomAvailabilityCalendar = async (roomTypeId, startDate, endDate) => {
  const roomType = await RoomType.findById(roomTypeId);
  if (!roomType) {
    return { available: false, reason: "Room type not found" };
  }

  const totalUnits = roomType.totalUnits;
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Find all bookings in the date range
  const bookings = await hotelReservation.find({
    room: roomTypeId,
    reservationStatus: { $nin: ["cancelled", "no_show"] },
    $or: [
      {
        checkInDate: { $gte: start, $lte: end }
      },
      {
        checkOutDate: { $gte: start, $lte: end }
      },
      {
        checkInDate: { $lt: start },
        checkOutDate: { $gt: end }
      }
    ]
  });

  // Calculate availability for each date
  const availability = [];
  let currentDate = new Date(start);
  
  while (currentDate <= end) {
    const dateKey = dayjs(currentDate).format("YYYY-MM-DD");
    
    // Count bookings that include this date
    const bookedUnits = bookings.filter(booking => {
      const checkIn = new Date(booking.checkInDate);
      const checkOut = new Date(booking.checkOutDate);
      return currentDate >= checkIn && currentDate < checkOut;
    }).length;

    const availableUnits = totalUnits - bookedUnits;
    
    availability.push({
      date: dateKey,
      totalUnits,
      bookedUnits,
      availableUnits,
      isAvailable: availableUnits > 0
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return {
    roomTypeId,
    roomTypeName: roomType.name,
    startDate: dayjs(start).format("YYYY-MM-DD"),
    endDate: dayjs(end).format("YYYY-MM-DD"),
    availability
  };
};

/**
 * Get table availability calendar for clubs
 * @param {string} tableTypeId - Table type ID
 * @param {Date|string} date - Date
 */
export const getTableAvailabilityForDate = async (tableTypeId, date) => {
  const tableType = await TableType.findById(tableTypeId);
  if (!tableType) {
    return { available: false, reason: "Table type not found" };
  }

  const totalTables = tableType.quantityAvailable;
  const bookingDate = new Date(date);

  // Get all bookings for this date
  const bookings = await clubReservation.find({
    table: tableTypeId,
    date: {
      $gte: dayjs(bookingDate).startOf("day").toDate(),
      $lte: dayjs(bookingDate).endOf("day").toDate()
    },
    reservationStatus: { $nin: ["cancelled", "no_show"] }
  });

  // Group by time slot
  const timeSlots = {};
  const allTimes = [
    "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", 
    "21:00", "21:30", "22:00", "22:30", "23:00", "23:30"
  ];

  for (const time of allTimes) {
    const bookingsAtTime = bookings.filter(b => b.time === time);
    const bookedTables = bookingsAtTime.length;
    timeSlots[time] = {
      totalTables,
      bookedTables,
      availableTables: totalTables - bookedTables,
      isAvailable: totalTables - bookedTables > 0
    };
  }

  return {
    tableTypeId,
    tableTypeName: tableType.name,
    date: dayjs(date).format("YYYY-MM-DD"),
    timeSlots
  };
};

/**
 * Validate availability before booking (supports multi-room/table)
 * @param {Object} bookingData - Booking data
 */
export const validateBookingAvailability = async (bookingData) => {
  const { reservationType, room, table, date, time, checkInDate, checkOutDate, guests, vendor, rooms, tables, _id: excludeBookingId } = bookingData;

  // Handle multi-room hotel bookings
  if (reservationType === "hotelReservation" || reservationType === "hotel") {
    if (rooms && rooms.length > 0) {
      // Multiple rooms booking
      return await checkMultipleRoomsAvailability(rooms, checkInDate, checkOutDate, excludeBookingId);
    }
    // Single room booking (legacy support)
    if (!room || !checkInDate || !checkOutDate) {
      return { valid: false, reason: "Missing required fields for hotel booking" };
    }
    return await checkRoomAvailability(room, checkInDate, checkOutDate, 1, excludeBookingId);
  }

  // Handle multi-table club bookings
  if (reservationType === "clubReservation" || reservationType === "club") {
    if (tables && tables.length > 0) {
      // Multiple tables booking
      return await checkMultipleTablesAvailability(tables, date, time, excludeBookingId);
    }
    // Single table booking (legacy support)
    if (!table || !date || !time) {
      return { valid: false, reason: "Missing required fields for club booking" };
    }
    return await checkTableAvailability(table, date, time, 1, excludeBookingId);
  }

  if (reservationType === "restaurantReservation" || reservationType === "restaurant") {
    if (!date || !time || !guests) {
      return { valid: false, reason: "Missing required fields for restaurant booking" };
    }
    return await checkRestaurantCapacity(vendor, date, time, guests, excludeBookingId);
  }

  return { valid: true };
};

/**
 * Calculate total price for multi-room booking
 * @param {Array} rooms - Array of { roomTypeId, quantity }
 * @param {Date|string} checkInDate - Check-in date
 * @param {Date|string} checkOutDate - Check-out date
 */
export const calculateMultiRoomPrice = async (rooms, checkInDate, checkOutDate) => {
  if (!rooms || rooms.length === 0) {
    return { total: 0, breakdown: [] };
  }

  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);
  const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

  if (nights < 1) {
    return { total: 0, breakdown: [], error: "Invalid date range" };
  }

  const breakdown = [];
  let total = 0;

  for (const roomItem of rooms) {
    const roomType = await RoomType.findById(roomItem.roomType);
    if (!roomType) {
      continue;
    }

    const subtotal = (roomType.pricePerNight || 0) * (roomItem.quantity || 1) * nights;
    total += subtotal;

    breakdown.push({
      roomTypeId: roomItem.roomType,
      roomTypeName: roomType.name,
      quantity: roomItem.quantity || 1,
      pricePerNight: roomType.pricePerNight || 0,
      nights,
      subtotal
    });
  }

  return { total, nights, breakdown };
};

/**
 * Calculate total price for multi-table booking
 * @param {Array} tables - Array of { tableTypeId, quantity }
 */
export const calculateMultiTablePrice = async (tables) => {
  if (!tables || tables.length === 0) {
    return { total: 0, breakdown: [] };
  }

  const breakdown = [];
  let total = 0;

  for (const tableItem of tables) {
    const tableType = await TableType.findById(tableItem.tableType);
    if (!tableType) {
      continue;
    }

    const subtotal = (tableType.price || 0) * (tableItem.quantity || 1);
    total += subtotal;

    breakdown.push({
      tableTypeId: tableItem.tableType,
      tableTypeName: tableType.name,
      quantity: tableItem.quantity || 1,
      pricePerTable: tableType.price || 0,
      subtotal
    });
  }

  return { total, breakdown };
};

