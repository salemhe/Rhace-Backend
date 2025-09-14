import Guest from "../models/guest.model.js";
import { recordAuditLog } from "../utils/auditLogger.js";

// @desc    Create a new guest
// @route   POST /api/guests
// @access  Private/Admin/Manager/Staff
export const createGuest = async (req, res) => {
  try {
    const { name, email, phone, document } = req.body;

    // Check if guest with this email already exists
    const existingGuest = await Guest.findOne({ email });
    if (existingGuest) {
      return res.status(400).json({ message: "Guest with this email already exists." });
    }

    const guest = new Guest({
      name,
      email,
      phone,
      document,
    });

    await guest.save();
    recordAuditLog(req.user._id, "CREATE_GUEST", "Guest", guest._id, guest.toObject());

    res.status(201).json(guest);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all guests
// @route   GET /api/guests
// @access  Private/Admin/Manager/Staff
export const getGuests = async (req, res) => {
  try {
    const guests = await Guest.find({});
    res.status(200).json(guests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single guest by ID
// @route   GET /api/guests/:id
// @access  Private/Admin/Manager/Staff
export const getGuestById = async (req, res) => {
  try {
    const guest = await Guest.findById(req.params.id);

    if (!guest) {
      return res.status(404).json({ message: "Guest not found" });
    }

    res.status(200).json(guest);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a guest
// @route   PUT /api/guests/:id
// @access  Private/Admin/Manager/Staff
export const updateGuest = async (req, res) => {
  try {
    const { name, email, phone, document } = req.body;

    const guest = await Guest.findById(req.params.id);

    if (!guest) {
      return res.status(404).json({ message: "Guest not found" });
    }

    // Check for unique email on update if it's being changed
    if (email && email !== guest.email) {
      const existingGuest = await Guest.findOne({ email });
      if (existingGuest) {
        return res.status(400).json({ message: "Guest with this email already exists." });
      }
    }

    guest.name = name || guest.name;
    guest.email = email || guest.email;
    guest.phone = phone || guest.phone;
    guest.document = document || guest.document;

    const updatedGuest = await guest.save();
    recordAuditLog(req.user._id, "UPDATE_GUEST", "Guest", updatedGuest._id, updatedGuest.toObject());

    res.status(200).json(updatedGuest);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a guest
// @route   DELETE /api/guests/:id
// @access  Private/Admin
export const deleteGuest = async (req, res) => {
  try {
    const guest = await Guest.findById(req.params.id);

    if (!guest) {
      return res.status(404).json({ message: "Guest not found" });
    }

    await guest.deleteOne();
    recordAuditLog(req.user._id, "DELETE_GUEST", "Guest", req.params.id, {});

    res.status(200).json({ message: "Guest removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
