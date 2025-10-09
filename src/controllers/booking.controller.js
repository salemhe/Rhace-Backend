import Booking from "../models/booking.model.js";
import RoomType from "../models/roomtype.model.js"; 
import Guest from "../models/guest.model.js";
import Branch from "../models/branch.model.js"; // Import Branch model
import { customAlphabet } from "nanoid";
import PaymentTransaction from "../models/paymenttransaction.model.js";
import pkg from "json-2-csv";
const { AsyncParser } = pkg;
import * as XLSX from "xlsx";
import { recordAuditLog } from "../utils/auditLogger.js";
import { sendBookingConfirmationEmail } from "../services/mail.service.js";

// @desc    Create a new booking
// @route   POST /api/bookings
// @access  Private
export const createBooking = async (req, res) => {
  try {
    const { branch: branchId, guestsCount, checkInDate, checkOutDate, roomType: roomTypeId } = req.body;

    // --- 1. Fetch Branch Details ---
    const branch = await Branch.findById(branchId);
    if (!branch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    // --- 2. Validate Branch Status ---
    if (branch.status !== "Opened") {
      return res.status(400).json({ message: `Branch is currently ${branch.status.toLowerCase()}.` });
    }

    const bookingCheckIn = new Date(checkInDate);
    const bookingCheckOut = new Date(checkOutDate);
    const currentDateTime = new Date();

    // --- 3. Validate Operating Days ---
    const dayOfWeek = bookingCheckIn.toLocaleString("en-US", { weekday: "long" });
    if (!branch.operatingDays.includes(dayOfWeek)) {
      return res.status(400).json({ message: `Branch is not open on ${dayOfWeek}.` });
    }

    // --- 4. Validate Operating Hours ---
    const branchOpenMinutes = timeToMinutes(branch.operatingHours.from);
    const branchCloseMinutes = timeToMinutes(branch.operatingHours.to);
    const bookingCheckInMinutes = bookingCheckIn.getHours() * 60 + bookingCheckIn.getMinutes();
    const bookingCheckOutMinutes = bookingCheckOut.getHours() * 60 + bookingCheckOut.getMinutes();

    if (bookingCheckInMinutes < branchOpenMinutes || bookingCheckOutMinutes > branchCloseMinutes) {
      return res.status(400).json({ message: "Booking falls outside branch operating hours." });
    }

    // --- 5. Validate Lead Time ---
    const minLeadTimeMillis = branch.minLeadTimeHours * 60 * 60 * 1000;
    if (bookingCheckIn.getTime() - currentDateTime.getTime() < minLeadTimeMillis) {
      return res.status(400).json({ message: `Bookings must be made at least ${branch.minLeadTimeHours} hours in advance.` });
    }

    // --- 6. Validate Cut-off Time (for same-day bookings) ---
    const isSameDayBooking = bookingCheckIn.toDateString() === currentDateTime.toDateString();
    if (isSameDayBooking && branch.cutOffTimeMinutes > 0) {
      const closingTimeToday = new Date(bookingCheckIn);
      closingTimeToday.setHours(parseInt(branch.operatingHours.to.split(":")[0]), parseInt(branch.operatingHours.to.split(":")[1]), 0, 0);
      
      const cutOffDateTime = new Date(closingTimeToday.getTime() - branch.cutOffTimeMinutes * 60 * 1000);

      if (currentDateTime.getTime() > cutOffDateTime.getTime()) {
        return res.status(400).json({ message: `Same-day bookings are not allowed after ${branch.cutOffTimeMinutes} minutes before closing.` });
      }
    }

    // --- 7. Validate Overall Branch Capacity ---
    if (branch.capacity > 0) {
      const existingBookingsForDay = await Booking.find({
        branch: branchId,
        status: { $nin: ["canceled", "no-show"] },
        checkInDate: { $lt: bookingCheckOut },
        checkOutDate: { $gt: bookingCheckIn },
      });

      const totalGuestsBooked = existingBookingsForDay.reduce((sum, booking) => sum + booking.guestsCount, 0);

      if (totalGuestsBooked + guestsCount > branch.capacity) {
        return res.status(400).json({ message: "Branch capacity exceeded for the selected time." });
      }
    }

    // --- 8. (Original) Room Type Availability (repurposed for table/rooms types/areas if applicable) ---
    // Assuming roomType here refers to a specific table/room type or area within the restaurant
    if (roomTypeId) {
      const roomType = await RoomType.findById(roomTypeId);
      if (!roomType) {
        return res.status(404).json({ message: "Table type/area not found" });
      }

      const overlappingBookingsForRoomType = await Booking.countDocuments({
        roomType: roomTypeId,
        status: { $nin: ["canceled", "no-show"] },
        $or: [
          {
            checkInDate: { $lt: new Date(checkOutDate) },
            checkOutDate: { $gt: new Date(checkInDate) },
          },
        ],
      });

      if (overlappingBookingsForRoomType >= roomType.totalUnits) {
        return res.status(400).json({ message: "No available tables/areas for the selected dates." });
      }
    }
    
    const bookingCode = `BKG-${nanoid()}`;

    // Handle guest information
    let guestId;
    if (req.body.guestInfo && req.body.guestInfo.email) {
      let guest = await Guest.findOne({ email: req.body.guestInfo.email });
      if (!guest) {
        guest = new Guest(req.body.guestInfo);
        await guest.save();
      }
      guestId = guest._id;
    } else {
      // If no guestInfo provided, or no email, use the logged-in user as guest (fallback)
      // Or throw an error if guestInfo is mandatory
      guestId = req.user._id; // Assuming req.user is a valid Guest or User ID
    }

    const booking = new Booking({
      ...req.body,
      guest: guestId,
      bookingCode: bookingCode,
    });

    const createdBooking = await booking.save();
    
    // Send confirmation email
    const populatedBooking = await Booking.findById(createdBooking._id).populate("guest").populate("hotel").populate("roomType");
    await sendBookingConfirmationEmail(populatedBooking.guest.email, {
      bookingCode: populatedBooking.bookingCode,
      hotelName: populatedBooking.hotel.name,
      roomType: populatedBooking.roomType.name,
      checkInDate: populatedBooking.checkInDate,
      checkOutDate: populatedBooking.checkOutDate,
      totalAmount: populatedBooking.totalAmount,
      currency: populatedBooking.currency,
    });

    res.status(201).json(createdBooking);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all bookings with filters
// @route   GET /api/bookings
// @access  Private
export const getBookings = async (req, res) => {
  try {
    const {
      status,
      paymentStatus,
      checkInDate,
      checkOutDate,
      search,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    let matchQuery = {};

    // Filter by status
    if (status) {
      matchQuery.status = status;
    }

    // Filter by payment status
    if (paymentStatus) {
      matchQuery.paymentStatus = paymentStatus;
    }

    // Filter by date range (check-in/check-out)
    if (checkInDate && checkOutDate) {
      matchQuery.checkInDate = { $gte: new Date(checkInDate) };
      matchQuery.checkOutDate = { $lte: new Date(checkOutDate) };
    } else if (checkInDate) {
      matchQuery.checkInDate = { $gte: new Date(checkInDate) };
    } else if (checkOutDate) {
      matchQuery.checkOutDate = { $lte: new Date(checkOutDate) };
    }

    let pipeline = [];

    // Add initial match stage for filters
    if (Object.keys(matchQuery).length > 0) {
      pipeline.push({ $match: matchQuery });
    }

    // Populate guest and then match for search
    pipeline.push(
      {
        $lookup: {
          from: "guests", // The collection name for Guest model
          localField: "guest",
          foreignField: "_id",
          as: "guestInfo",
        },
      },
      {
        $unwind: "$guestInfo",
      }
    );

    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { bookingCode: { $regex: search, $options: "i" } },
            { "guestInfo.name": { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    // Count total documents before pagination
    const totalBookings = await Booking.aggregate([...pipeline, { $count: "total" }]);
    const total = totalBookings.length > 0 ? totalBookings[0].total : 0;

    // Sorting
    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;
    pipeline.push({ $sort: sort });

    // Pagination
    const skip = (page - 1) * limit;
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: parseInt(limit) });

    // Project fields to match populate output
    pipeline.push({
      $project: {
        _id: 1,
        bookingCode: 1,
        hotel: 1,
        roomType: 1,
        guest: "$guestInfo", // Use the populated guestInfo
        checkInDate: 1,
        checkOutDate: 1,
        guestsCount: 1,
        status: 1,
        totalAmount: 1,
        currency: 1,
        paymentStatus: 1,
        notes: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    });

    const bookings = await Booking.aggregate(pipeline);

    // Manually populate hotel and roomType after aggregation
    await Booking.populate(bookings, [
      { path: "hotel", select: "name" },
      { path: "roomType", select: "name" },
    ]);

    res.status(200).json({
      total: total,
      page: parseInt(page),
      limit: parseInt(limit),
      bookings,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// @desc    Get booking by ID
// @route   GET /api/bookings/:id
// @access  Private
export const getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("hotel")
      .populate("roomType")
      .populate("guest");
    if (booking) {
      res.status(200).json(booking);
    } else {
      res.status(404).json({ message: "Booking not found" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a booking (e.g., dates, guests)
// @route   PUT /api/bookings/:id
// @access  Private
export const updateBooking = async (req, res) => {
  try {
    const booking = await Booking.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (booking) {
      res.status(200).json(booking);
    } else {
      res.status(404).json({ message: "Booking not found" });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Cancel a booking
// @route   PUT /api/bookings/:id/cancel
// @access  Private
export const cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (booking) {
      booking.status = "canceled";
      const updatedBooking = await booking.save();
      res.status(200).json(updatedBooking);
    } else {
      res.status(404).json({ message: "Booking not found" });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Mark a booking as no-show
// @route   PUT /api/bookings/:id/no-show
// @access  Private
export const markAsNoShow = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (booking) {
      booking.status = "no-show";
      const updatedBooking = await booking.save();
      res.status(200).json(updatedBooking);
    } else {
      res.status(404).json({ message: "Booking not found" });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get booking counts by status
// @route   GET /api/bookings/counts
// @access  Private
export const getBookingCounts = async (req, res) => {
  try {
    const counts = await Booking.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const formattedCounts = counts.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    // Add total count
    const total = await Booking.countDocuments({});
    formattedCounts.all = total;

    res.status(200).json(formattedCounts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Refund a booking
// @route   POST /api/bookings/:id/refund
// @access  Private
export const refundBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Check if booking is already refunded or not paid
    if (booking.paymentStatus === "refunded") {
      return res.status(400).json({ message: "Booking is already refunded." });
    }
    if (booking.paymentStatus === "unpaid") {
      return res.status(400).json({ message: "Booking is unpaid, no refund needed." });
    }

    // will Integrate with payment gateway for actual refund
    // For now, it is just for update status
    booking.paymentStatus = "refunded";
    const updatedBooking = await booking.save();

    // Create a refund transaction record
    const refundTransaction = new PaymentTransaction({booking: booking._id,
      amount: booking.totalAmount, // Assuming full refund for now
      method: "refund", // Or original payment method
      providerRef: `REFUND-${nanoid()}`,
      status: "refunded",
    });
    await refundTransaction.save();

    res.status(200).json(updatedBooking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Export bookings to CSV
// @route   GET /api/bookings/export
// @access  Private
export const exportBookings = async (req, res) => {
  try {
    // Reuse the filtering logic from getBookings
    const {
      status,
      paymentStatus,
      checkInDate,
      checkOutDate,
      search,
    } = req.query;

    let query = {};

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by payment status
    if (paymentStatus) {
      query.paymentStatus = paymentStatus;
    }

    // Filter by date range (check-in/check-out)
    if (checkInDate && checkOutDate) {
      query.checkInDate = { $gte: new Date(checkInDate) };
      query.checkOutDate = { $lte: new Date(checkOutDate) };
    } else if (checkInDate) {
      query.checkInDate = { $gte: new Date(checkInDate) };
    } else if (checkOutDate) {
      query.checkOutDate = { $lte: new Date(checkOutDate) };
    }

    // Search by guest name or booking ID
    if (search) {
      query.$or = [
        { bookingCode: { $regex: search, $options: "i" } },
      ];
    }

    const bookings = await Booking.find(query)
      .populate("hotel", "name")
      .populate("roomType", "name")
      .populate("guest", "name email phone")
      .lean(); // Use .lean() for plain JavaScript objects, better for CSV conversion

    // Format data for CSV
    const dataToExport = bookings.map((booking) => ({
      bookingCode: booking.bookingCode,
      hotelName: booking.hotel ? booking.hotel.name : "",
      roomType: booking.roomType ? booking.roomType.name : "",
      guestName: booking.guest ? booking.guest.name : "",
      guestEmail: booking.guest ? booking.guest.email : "",
      checkInDate: booking.checkInDate.toISOString().split("T")[0],
      checkOutDate: booking.checkOutDate.toISOString().split("T")[0],
      adults: booking.guestsCount.adults,
      children: booking.guestsCount.children,
      status: booking.status,
      totalAmount: booking.totalAmount,
      currency: booking.currency,
      paymentStatus: booking.paymentStatus,
      notes: booking.notes,
      createdAt: booking.createdAt.toISOString(),
    }));

    const { format = "csv" } = req.query; // Default to CSV

    if (format === "xlsx") {
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Bookings");
      const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      res.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.attachment("bookings.xlsx");
      return res.send(xlsxBuffer);
    } else {
      // Default to CSV
      const asyncParser = new AsyncParser();
      const csv = await asyncParser.parse(dataToExport);

      res.header("Content-Type", "text/csv");
      res.attachment("bookings.csv");
      res.send(csv);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Perform bulk update on bookings (e.g., status change)
// @route   PUT /api/bookings/bulk-update
// @access  Private
export const bulkUpdateBookings = async (req, res) => {
  try {
    const { bookingIds, updateFields } = req.body; // updateFields could be { status: "completed" }

    if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
      return res.status(400).json({ message: "No booking IDs provided for bulk update." });
    }
    if (!updateFields || Object.keys(updateFields).length === 0) {
      return res.status(400).json({ message: "No fields provided for bulk update." });
    }

    // Perform the bulk update
    const result = await Booking.updateMany(
      { _id: { $in: bookingIds } },
      { $set: updateFields }
    );

    res.status(200).json({
      message: `${result.modifiedCount} bookings updated successfully.`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add a note to a booking
// @route   PATCH /api/bookings/:id/note
// @access  Private
export const addBookingNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const booking = await Booking.findById(id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    booking.notes = notes;
    const updatedBooking = await booking.save();
    recordAuditLog(req.user._id, "ADD_BOOKING_NOTE", "Booking", updatedBooking._id, { notes: updatedBooking.notes });

    res.status(200).json(updatedBooking);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Generate PDF receipt for a booking
// @route   GET /api/bookings/:id/receipt
// @access  Private
export const generateBookingReceipt = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("hotel", "name")
      .populate("guest", "name")
      .populate({
        path: "mealSelections.menuItem",
        select: "name"
      });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const pdfStream = generateBookingReceiptPDF(booking);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=receipt-${booking.bookingCode}.pdf`);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ guest: req.user._id })
      .populate("hotel", "name")
      .populate("roomType", "name");

    res.status(200).json(bookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};