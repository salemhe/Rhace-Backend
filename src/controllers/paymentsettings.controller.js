import PaymentSettings from "../models/paymentsettings.model.js";
import Hotel from "../models/hotel.model.js";
import { recordAuditLog } from "../utils/auditLogger.js";

// @desc    Create or update payment settings for a specific hotel
// @route   POST /api/hotels/:hotelId/payment-settings
// @access  Private/Admin/Manager
export const createOrUpdatePaymentSettings = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { requireFullPayment, allowPartPayment, allowPayAtHotel, acceptedMethods, instructions } = req.body;

    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }

    // --- Validation --- //
    if (requireFullPayment && allowPartPayment) {
      return res.status(400).json({ message: "Cannot require full payment and allow part payment simultaneously." });
    }
    if (acceptedMethods !== undefined && !Array.isArray(acceptedMethods)) {
      return res.status(400).json({ message: "acceptedMethods must be an array." });
    }
    // --- End Validation --- //

    let paymentSettings = await PaymentSettings.findOne({ hotelId });

    if (paymentSettings) {
      // Update existing settings
      paymentSettings.requireFullPayment = requireFullPayment !== undefined ? requireFullPayment : paymentSettings.requireFullPayment;
      paymentSettings.allowPartPayment = allowPartPayment !== undefined ? allowPartPayment : paymentSettings.allowPartPayment;
      paymentSettings.allowPayAtHotel = allowPayAtHotel !== undefined ? allowPayAtHotel : paymentSettings.allowPayAtHotel;
      paymentSettings.acceptedMethods = acceptedMethods || paymentSettings.acceptedMethods;
      paymentSettings.instructions = instructions || paymentSettings.instructions;

      const updatedSettings = await paymentSettings.save();
      recordAuditLog(req.user._id, "UPDATE_PAYMENT_SETTINGS", "PaymentSettings", updatedSettings._id, updatedSettings.toObject());
      res.status(200).json(updatedSettings);
    } else {
      // Create new settings
      paymentSettings = new PaymentSettings({
        hotelId,
        requireFullPayment,
        allowPartPayment,
        allowPayAtHotel,
        acceptedMethods,
        instructions,
      });

      const newSettings = await paymentSettings.save();
      // Link settings to hotel
      hotel.paymentSettingsId = newSettings._id;
      await hotel.save();

      recordAuditLog(req.user._id, "CREATE_PAYMENT_SETTINGS", "PaymentSettings", newSettings._id, newSettings.toObject());
      res.status(201).json(newSettings);
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get payment settings for a specific hotel
// @route   GET /api/hotels/:hotelId/payment-settings
// @access  Private/Admin/Manager/Staff
export const getPaymentSettings = async (req, res) => {
  try {
    const { hotelId } = req.params;

    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }

    const paymentSettings = await PaymentSettings.findOne({ hotelId });

    if (!paymentSettings) {
      return res.status(404).json({ message: "Payment settings not found for this hotel" });
    }

    res.status(200).json(paymentSettings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete payment settings for a specific hotel
// @route   DELETE /api/hotels/:hotelId/payment-settings
// @access  Private/Admin
export const deletePaymentSettings = async (req, res) => {
  try {
    const { hotelId } = req.params;

    const paymentSettings = await PaymentSettings.findOne({ hotelId });

    if (!paymentSettings) {
      return res.status(404).json({ message: "Payment settings not found for this hotel" });
    }

    await paymentSettings.deleteOne();
    // Unlink settings from hotel
    const hotel = await Hotel.findById(hotelId);
    if (hotel) {
      hotel.paymentSettingsId = undefined; // Or null, depending on preference
      await hotel.save();
    }

    recordAuditLog(req.user._id, "DELETE_PAYMENT_SETTINGS", "PaymentSettings", paymentSettings._id, {});

    res.status(200).json({ message: "Payment settings removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};