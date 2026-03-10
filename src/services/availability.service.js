
import { Booking, hotelReservation, restaurantReservation, clubReservation } from "../models/booking.model.js";
import RoomType from "../models/roomtype.model.js";
import TableType from "../models/tableType.model.js";
import dayjs from "dayjs";

/**
 * Check room availability for hotels (supports multi-room booking)
 */
export const checkRoomAvailability = async (roomTypeId, checkInDate, checkOutDate, requestedQuantity = 1, excludeBookingId = null) => {
  const roomType = await RoomType.findById(roomTypeId);
  if (!roomType) {
    return { available: false, reason: "Room type not found" };
  }

  const totalUnits = roomType.totalUnits;
  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);

  const bookingQuery = {
    room: roomTypeId,
    reservationStatus: { $nin: ["cancelled", "no_show"] },
    $or: [
      { checkInDate: { $lt: checkOut }, checkOutDate: { $gt: checkIn } }
    ]
  };

  if (excludeBookingId) {
    bookingQuery._id = { $ne: excludeBookingId };
  }

  const existingBookings = await hotelReservation.find(bookingQuery);
  
  const bookedUnitsByDate = {};
  
  for (const booking of existingBookings) {
    const bookingCheckIn = new Date(booking.checkInDate);
    const bookingCheckOut = new Date(booking.checkOutDate);
    
    const bookedQuantity = booking.rooms ? 
      booking.rooms.reduce((sum, r) => sum + (r.quantity || 1), 0) : 
      (booking.quantity || 1);
    
    let currentDate = new Date(bookingCheckIn);
    while (currentDate < bookingCheckOut) {
      const dateKey = dayjs(currentDate).format("YYYY-MM-DD");
      bookedUnitsByDate[dateKey] = (bookedUnitsByDate[dateKey] || 0) + bookedQuantity;
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

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

  const totalAvailable = Math.min(...results.map(r => r.availableUnits));
  const totalRequested = rooms.reduce((sum, r) => sum + r.quantity, 0);

  const roomTypeIds = rooms.map(r => r.roomType);
  const roomTypes = await RoomType.find({ _id: { $in: roomTypeIds } });
  const roomTypeMap = {};
  roomTypes.forEach(rt => { roomTypeMap[rt._id.toString()] = rt; });

  const breakdown = rooms.map(r => {
    const rt = roomTypeMap[r.roomType];
    const result = results.find(res => res.roomTypeId === r.roomType);
    return {
      roomTypeId: r.roomType,
      quantity: r.quantity,
      pricePerNight: rt?.pricePerNight || 0,
      available: result?.available || false,
      availableUnits: result?.availableUnits || 0
    };
  });

  return {
    available: true,
    totalRooms: totalRequested,
    availableUnits: totalAvailable,
    results,
    breakdown
  };
};

/**
 * Check table availability for clubs
 */
export const checkTableAvailability = async (tableTypeId, date, time, requestedQuantity = 1, excludeBookingId = null) => {
  const tableType = await TableType.findById(tableTypeId);
  if (!tableType) {
    return { available: false, reason: "Table type not found" };
  }

  const totalTables = tableType.quantityAvailable;
  const bookingDate = new Date(date);

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
  
  let bookedTables = 0;
  for (const booking of existingBookings) {
    if (booking.tables && booking.tables.length > 0) {
      bookedTables += booking.tables.reduce((sum, t) => sum + (t.quantity || 1), 0);
    } else {
      bookedTables += 1;
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

  const totalAvailable = Math.min(...results.map(r => r.availableTables));
  const totalRequested = tables.reduce((sum, t) => sum + t.quantity, 0);

  const tableTypeIds = tables.map(t => t.tableType);
  const tableTypes = await TableType.find({ _id: { $in: tableTypeIds } });
  const tableTypeMap = {};
  tableTypes.forEach(tt => { tableTypeMap[tt._id.toString()] = tt; });

  const breakdown = tables.map(t => {
    const tt = tableTypeMap[t.tableType];
    const result = results.find(res => res.tableTypeId === t.tableType);
    return {
      tableTypeId: t.tableType,
      quantity: t.quantity,
      pricePerTable: tt?.price || 0,
      available: result?.available || false,
      availableTables: result?.availableTables || 0
    };
  });

  return {
    available: true,
    totalTables: totalRequested,
    availableTables: totalAvailable,
    results,
    breakdown
  };
};

/**
 * Check restaurant capacity
 */
export const checkRestaurantCapacity = async (vendorId, date, time, partySize, excludeBookingId = null) => {
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

  const MAX_CAPACITY = 100;

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
 * Get availability calendar for a room type
 */
export const getRoomAvailabilityCalendar = async (roomTypeId, startDate, endDate) => {
  const roomType = await RoomType.findById(roomTypeId);
  if (!roomType) {
    return { available: false, reason: "Room type not found" };
  }

  const totalUnits = roomType.totalUnits;
  const start = new Date(startDate);
  const end = new Date(endDate);

  const bookings = await hotelReservation.find({
    room: roomTypeId,
    reservationStatus: { $nin: ["cancelled", "no_show"] },
    $or: [
      { checkInDate: { $gte: start, $lte: end } },
      { checkOutDate: { $gte: start, $lte: end } },
      { checkInDate: { $lt: start }, checkOutDate: { $gt: end } }
    ]
  });

  const availability = [];
  let currentDate = new Date(start);
  
  while (currentDate <= end) {
    const dateKey = dayjs(currentDate).format("YYYY-MM-DD");
    
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
 * Get table availability for date
 */
export const getTableAvailabilityForDate = async (tableTypeId, date) => {
  const tableType = await TableType.findById(tableTypeId);
  if (!tableType) {
    return { available: false, reason: "Table type not found" };
  }

  const totalTables = tableType.quantityAvailable;
  const bookingDate = new Date(date);

  const bookings = await clubReservation.find({
    table: tableTypeId,
    date: {
      $gte: dayjs(bookingDate).startOf("day").toDate(),
      $lte: dayjs(bookingDate).endOf("day").toDate()
    },
    reservationStatus: { $nin: ["cancelled", "no_show"] }
  });

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
 * Validate availability before booking
 */
export const validateBookingAvailability = async (bookingData) => {
  const { reservationType, room, table, date, time, checkInDate, checkOutDate, guests, vendor, rooms, tables, _id: excludeBookingId } = bookingData;

  if (reservationType === "hotelReservation" || reservationType === "hotel") {
    if (rooms && rooms.length > 0) {
      return await checkMultipleRoomsAvailability(rooms, checkInDate, checkOutDate, excludeBookingId);
    }
    if (!room || !checkInDate || !checkOutDate) {
      return { valid: false, reason: "Missing required fields for hotel booking" };
    }
    return await checkRoomAvailability(room, checkInDate, checkOutDate, 1, excludeBookingId);
  }

  if (reservationType === "clubReservation" || reservationType === "club") {
    if (tables && tables.length > 0) {
      return await checkMultipleTablesAvailability(tables, date, time, excludeBookingId);
    }
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

