import mongoose from "mongoose";
import { hotelReservation, clubReservation, restaurantReservation } from "../models/booking.model.js";
import RoomType from "../models/roomtype.model.js";
import TableType from "../models/tableType.model.js";
import { recordAuditLog } from "../utils/auditLogger.js";
import crypto from "crypto";
import dayjs from "dayjs";

const generateBookingCode = () => {
  const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `RHC${randomPart}`;
};

const getRoomAvailabilityWithLock = async (session, roomTypeId, checkInDate, checkOutDate, requestedQuantity, excludeBookingId) => {
  const roomType = await RoomType.findById(roomTypeId).session(session);
  if (!roomType) {
    return { available: false, reason: "Room type not found" };
  }

  const totalUnits = roomType.totalUnits;
  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);

  let matchQuery = {
    room: new mongoose.Types.ObjectId(roomTypeId),
    reservationStatus: { $nin: ["cancelled", "no_show"] },
    $or: [
      { checkInDate: { $lt: checkOut }, checkOutDate: { $gt: checkIn } }
    ]
  };

  if (excludeBookingId) {
    matchQuery._id = { $ne: new mongoose.Types.ObjectId(excludeBookingId) };
  }

const result = await hotelReservation.aggregate([
    { $match: matchQuery },
    {
      $project: {
        bookedQuantity: {
          $cond: {
            if: { $eq: [{ $type: "$rooms"}, "array"] },
            then: { $sum: "$rooms.quantity" },
            else: 1
          }
        }
      }
    },
    {
      $group: {
        _id: null,
        totalBooked: { $sum: "$bookedQuantity" }
      }
    }
  ]).session(session);

  const bookedUnits = result[0]?.totalBooked || 0;
  const availableUnits = totalUnits - bookedUnits;

  if (availableUnits < requestedQuantity) {
    return {
      available: false,
      reason: `Only ${availableUnits} rooms available (requested: ${requestedQuantity})`,
      bookedUnits,
      availableUnits,
      totalUnits
    };
  }

  return { available: true, bookedUnits, availableUnits, totalUnits };
};

const getTableAvailabilityWithLock = async (session, tableTypeId, date, time, requestedQuantity, excludeBookingId) => {
  const tableType = await TableType.findById(tableTypeId).session(session);
  if (!tableType) {
    return { available: false, reason: "Table type not found" };
  }

  const totalTables = tableType.quantityAvailable;
  const bookingDate = new Date(date);

  let matchQuery = {
    table: new mongoose.Types.ObjectId(tableTypeId),
    date: {
      $gte: dayjs(bookingDate).startOf("day").toDate(),
      $lte: dayjs(bookingDate).endOf("day").toDate()
    },
    time: time,
    reservationStatus: { $nin: ["cancelled", "no_show"] }
  };

  if (excludeBookingId) {
    matchQuery._id = { $ne: new mongoose.Types.ObjectId(excludeBookingId) };
  }

  const result = await clubReservation.aggregate([
    { $match: matchQuery },
    {
      $project: {
        bookedQuantity: {
          $cond: {
            if: { $eq: [{ $type: "$tables"}, "array"] },
            then: { $sum: "$tables.quantity" },
            else: 1
          }
        }
      }
    },
    {
      $group: {
        _id: null,
        totalBooked: { $sum: "$bookedQuantity" }
      }
    }
  ]).session(session);

  const bookedTables = result[0]?.totalBooked || 0;
  const availableTables = totalTables - bookedTables;

  if (availableTables < requestedQuantity) {
    return {
      available: false,
      reason: `Only ${availableTables} tables available (requested: ${requestedQuantity})`,
      bookedTables,
      availableTables,
      totalTables
    };
  }

  

  return { available: true, bookedTables, availableTables, totalTables };
};

export const atomicCreateHotelBooking = async (bookingData, userId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      vendor, customerName, customerId, customerEmail, location,
      checkInDate, checkOutDate, guests, rooms, specialRequest,
      partPaid, payLater, totalAmount, resId, paymentRef
    } = bookingData;

    for (const roomItem of rooms) {
      const availability = await getRoomAvailabilityWithLock(
        session,
        roomItem.roomType,
        checkInDate,
        checkOutDate,
        roomItem.quantity
      );

      if (!availability.available) {
        await session.abortTransaction();
        session.endSession();
        return { success: false, reason: availability.reason };
      }
    }

    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
    const calculatedTotal = rooms.reduce((sum, r) => sum + (r.pricePerNight * r.quantity * nights), 0);
    const totalRooms = rooms.reduce((sum, r) => sum + r.quantity, 0);

    const bookingCode = generateBookingCode();
    const qrConfirmationToken = crypto.randomBytes(32).toString("hex");

    const hotelData = {
      resId,
      bookingCode,
      paymentRef,
      customerId,
      customerName,
      customerEmail,
      vendor,
      location,
      totalAmount: totalAmount || calculatedTotal,
      paymentStatus: partPaid ? "Part Paid" : payLater ? "Not Paid" : "Paid",
      payLater,
      partPaid,
      reservationStatus: "upcoming",
      reservationType: "hotelReservation",
      checkInDate,
      checkOutDate,
      guests,
      rooms,
      totalRooms,
      specialRequest,
      qrConfirmationToken
    };

    const [booking] = await hotelReservation.create([hotelData], { session });
    
    await recordAuditLog(userId, "ATOMIC_BOOKING_CREATED", "HotelReservation", booking._id, {
      rooms: rooms.length,
      totalRooms,
      totalAmount: booking.totalAmount
    });

    await session.commitTransaction();
    session.endSession();

    return { success: true, booking };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

export const atomicCreateClubBooking = async (bookingData, userId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      vendor, customerName, customerId, customerEmail, location,
      date, time, guests, tables, drinks, combos, specialRequest,
      partPaid, payLater, totalAmount, resId, paymentRef
    } = bookingData;

    for (const tableItem of tables) {
      const availability = await getTableAvailabilityWithLock(
        session,
        tableItem.tableType,
        date,
        time,
        tableItem.quantity
      );

      if (!availability.available) {
        await session.abortTransaction();
        session.endSession();
        return { success: false, reason: availability.reason };
      }
    }

    const calculatedTotal = tables.reduce((sum, t) => sum + (t.pricePerTable * t.quantity), 0);
    const totalTables = tables.reduce((sum, t) => sum + t.quantity, 0);

    const bookingCode = generateBookingCode();
    const qrConfirmationToken = crypto.randomBytes(32).toString("hex");

    const clubData = {
      resId,
      bookingCode,
      paymentRef,
      customerId,
      customerName,
      customerEmail,
      vendor,
      location,
      totalAmount: totalAmount || calculatedTotal,
      paymentStatus: partPaid ? "Part Paid" : payLater ? "Not Paid" : "Paid",
      payLater,
      partPaid,
      reservationStatus: "upcoming",
      reservationType: "clubReservation",
      date,
      time,
      guests,
      tables,
      totalTables,
      drinks,
      combos,
      specialRequest,
      qrConfirmationToken
    };

    const [booking] = await clubReservation.create([clubData], { session });
    
    await recordAuditLog(userId, "ATOMIC_BOOKING_CREATED", "ClubReservation", booking._id, {
      tables: tables.length,
      totalTables,
      totalAmount: booking.totalAmount
    });

    await session.commitTransaction();
    session.endSession();

    return { success: true, booking };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

export const atomicCreateRestaurantBooking = async (bookingData, userId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      vendor, customerName, customerId, customerEmail, location,
      date, time, guests, menus, specialOccasion, seatingPreference,
      specialRequest, partPaid, payLater, totalAmount, resId, paymentRef
    } = bookingData;

    const calculatedTotal = menus?.reduce((sum, m) => sum + (m.price * m.quantity), 0) || 0;

    const bookingCode = generateBookingCode();
    const qrConfirmationToken = crypto.randomBytes(32).toString("hex");

    const restaurantData = {
      resId,
      bookingCode,
      paymentRef,
      customerId,
      customerName,
      customerEmail,
      vendor,
      location,
      totalAmount: totalAmount || calculatedTotal,
      paymentStatus: partPaid ? "Part Paid" : payLater ? "Not Paid" : "Paid",
      payLater,
      partPaid,
      reservationStatus: "upcoming",
      reservationType: "restaurantReservation",
      date,
      time,
      guests,
      menus,
      specialOccasion,
      seatingPreference,
      specialRequest,
      qrConfirmationToken
    };

    const [booking] = await restaurantReservation.create([restaurantData], { session });
    
    await recordAuditLog(userId, "ATOMIC_BOOKING_CREATED", "RestaurantReservation", booking._id, {
      guests,
      totalAmount: booking.totalAmount
    });

    await session.commitTransaction();
    session.endSession();

    return { success: true, booking };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};
