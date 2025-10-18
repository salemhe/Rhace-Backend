import HotelPolicy from "../models/hotelpolicy.model.js";
import Hotel from "../models/hotel.model.js";
import { recordAuditLog } from "../utils/auditLogger.js";

// Helper for time format validation (HH:MM)
const isValidTimeFormat = (time) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);

// @desc    Create or update hotel policy for a specific hotel
// @route   POST /api/hotels/:hotelId/policy
// @access  Private/Admin/Manager
export const createOrUpdateHotelPolicy = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { checkInTime, checkOutTime, minLeadHours, maxAdvanceDays, cancellationType, freeCancelHours, customPolicyNote } = req.body;

    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }

    // --- Validation --- //
    if (checkInTime && !isValidTimeFormat(checkInTime)) {
      return res.status(400).json({ message: "Invalid checkInTime format. Expected HH:MM." });
    }
    if (checkOutTime && !isValidTimeFormat(checkOutTime)) {
      return res.status(400).json({ message: "Invalid checkOutTime format. Expected HH:MM." });
    }
    if (minLeadHours !== undefined && (typeof minLeadHours !== 'number' || minLeadHours < 0)) {
      return res.status(400).json({ message: "minLeadHours must be a non-negative number." });
    }
    if (maxAdvanceDays !== undefined && (typeof maxAdvanceDays !== 'number' || maxAdvanceDays < 0)) {
      return res.status(400).json({ message: "maxAdvanceDays must be a non-negative number." });
    }
    if (freeCancelHours !== undefined && (typeof freeCancelHours !== 'number' || freeCancelHours < 0)) {
      return res.status(400).json({ message: "freeCancelHours must be a non-negative number." });
    }
    // --- End Validation --- //

    let hotelPolicy = await HotelPolicy.findOne({ hotelId });

    if (hotelPolicy) {
      // Update existing policy
      hotelPolicy.checkInTime = checkInTime || hotelPolicy.checkInTime;
      hotelPolicy.checkOutTime = checkOutTime || hotelPolicy.checkOutTime;
      hotelPolicy.minLeadHours = minLeadHours !== undefined ? minLeadHours : hotelPolicy.minLeadHours;
      hotelPolicy.maxAdvanceDays = maxAdvanceDays !== undefined ? maxAdvanceDays : hotelPolicy.maxAdvanceDays;
      hotelPolicy.cancellationType = cancellationType || hotelPolicy.cancellationType;
      hotelPolicy.freeCancelHours = freeCancelHours !== undefined ? freeCancelHours : hotelPolicy.freeCancelHours;
      hotelPolicy.customPolicyNote = customPolicyNote || hotelPolicy.customPolicyNote;

      const updatedPolicy = await hotelPolicy.save();
      recordAuditLog(req.user._id, "UPDATE_HOTEL_POLICY", "HotelPolicy", updatedPolicy._id, updatedPolicy.toObject());
      res.status(200).json(updatedPolicy);
    } else {
      // Create new policy
      hotelPolicy = new HotelPolicy({
        hotelId,
        checkInTime,
        checkOutTime,
        minLeadHours,
        maxAdvanceDays,
        cancellationType,
        freeCancelHours,
        customPolicyNote,
      });

      const newPolicy = await hotelPolicy.save();
      // Link policy to hotel
      hotel.policyId = newPolicy._id;
      await hotel.save();

      recordAuditLog(req.user._id, "CREATE_HOTEL_POLICY", "HotelPolicy", newPolicy._id, newPolicy.toObject());
      res.status(201).json(newPolicy);
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get hotel policy for a specific hotel
// @route   GET /api/hotels/:hotelId/policy
// @access  Private/Admin/Manager/Staff
export const getHotelPolicy = async (req, res) => {
  try {
    const { hotelId } = req.params;

    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }

    const hotelPolicy = await HotelPolicy.findOne({ hotelId });

    if (!hotelPolicy) {
      return res.status(404).json({ message: "Hotel policy not found for this hotel" });
    }

    res.status(200).json(hotelPolicy);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete hotel policy for a specific hotel
// @route   DELETE /api/hotels/:hotelId/policy
// @access  Private/Admin
export const deleteHotelPolicy = async (req, res) => {
  try {
    const { hotelId } = req.params;

    const hotelPolicy = await HotelPolicy.findOne({ hotelId });

    if (!hotelPolicy) {
      return res.status(404).json({ message: "Hotel policy not found for this hotel" });
    }

    await hotelPolicy.deleteOne();
    // Unlink policy from hotel
    const hotel = await Hotel.findById(hotelId);
    if (hotel) {
      hotel.policyId = undefined; // Or null, depending on preference
      await hotel.save();
    }

    recordAuditLog(req.user._id, "DELETE_HOTEL_POLICY", "HotelPolicy", hotelPolicy._id, {});

    res.status(200).json({ message: "Hotel policy removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};