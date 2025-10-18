
import Reservation from "../models/reservation.model.js";
import TableType from "../models/tableType.model.js";

// @desc    Create a new reservation
// @route   POST /api/reservations
// @access  Private/Admin
export const createReservation = async (req, res) => {
  try {
    const { clubId, tableType, guest, checkInDate, checkOutDate, partySize } = req.body;

    // Check table availability
    const table = await TableType.findById(tableType);
    if (!table) {
      return res.status(404).json({ message: "Table type not found" });
    }

    const existingReservations = await Reservation.find({
      tableType,
      $or: [
        { checkInDate: { $lt: checkOutDate }, checkOutDate: { $gt: checkInDate } },
      ],
    });

    if (existingReservations.length >= table.quantityAvailable) {
      return res.status(400).json({ message: "No tables available for the selected time slot" });
    }

    const reservation = new Reservation(req.body);
    await reservation.save();
    res.status(201).json(reservation);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all reservations for a club
// @route   GET /api/reservations
// @access  Private/Admin
export const getReservations = async (req, res) => {
  try {
    const { clubId } = req.query;
    const reservations = await Reservation.find({ clubId })
      .populate("tableType")
      .populate("guest");
    res.status(200).json(reservations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get a single reservation by ID
// @route   GET /api/reservations/:id
// @access  Private/Admin
export const getReservationById = async (req, res) => {
  try {
    const { id } = req.params;
    const reservation = await Reservation.findById(id)
      .populate("tableType")
      .populate("guest");
    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }
    res.status(200).json(reservation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a reservation
// @route   PUT /api/reservations/:id
// @access  Private/Admin
export const updateReservation = async (req, res) => {
  try {
    const { id } = req.params;
    const reservation = await Reservation.findByIdAndUpdate(id, req.body, { new: true });
    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }
    res.status(200).json(reservation);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a reservation
// @route   DELETE /api/reservations/:id
// @access  Private/Admin
export const deleteReservation = async (req, res) => {
  try {
    const { id } = req.params;
    const reservation = await Reservation.findByIdAndDelete(id);
    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }
    res.status(200).json({ message: "Reservation removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
