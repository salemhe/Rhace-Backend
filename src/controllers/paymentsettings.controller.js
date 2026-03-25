import PaymentSettings from "../models/paymentsettings.model.js";
import { Vendor } from "../models/vendor.model.js";
import axios from "axios";
import { recordAuditLog } from "../utils/auditLogger.js";

// @desc    Create or update payment settings for any vendor
// @route   POST /api/vendors/:vendorId/payment-settings  
// @access  Private/Vendor/Admin
export const createOrUpdatePaymentSettings = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { 
      requireFullPayment, 
      allowPartPayment, 
      allowPayLater, 
      acceptedMethods, 
      instructions 
    } = req.body;

    // Verify vendor exists and user has permission
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }
    
    const isOwnerOrAdmin = req.user.role === 'admin' || 
                          req.user.role === 'superadmin' || 
                          req.user._id.toString() === vendorId;
    if (!isOwnerOrAdmin) {
      return res.status(403).json({ message: "Not authorized to modify this vendor" });
    }

    // Create or update settings
    let settings = await PaymentSettings.findOne({ vendorId });
    if (settings) {
      // Update
      settings.requireFullPayment = requireFullPayment ?? settings.requireFullPayment;
      settings.allowPartPayment = allowPartPayment ?? settings.allowPartPayment;
      settings.allowPayLater = allowPayLater ?? settings.allowPayLater;
      settings.acceptedMethods = acceptedMethods ?? settings.acceptedMethods;
      settings.instructions = instructions ?? settings.instructions;
      settings.isActive = true;

      const updated = await settings.save();
      vendor.paymentSettingsId = updated._id;
      await vendor.save();
      
      recordAuditLog(req.user._id, "UPDATE_PAYMENT_SETTINGS", "PaymentSettings", updated._id);
      return res.json(updated);
    } else {
      // Create new
      settings = new PaymentSettings({
        vendorId,
        requireFullPayment: requireFullPayment ?? true,
        allowPartPayment: allowPartPayment ?? false,
        allowPayLater: allowPayLater ?? true,
        acceptedMethods: acceptedMethods ?? ['card', 'bank_transfer'],
        instructions: instructions ?? '',
        isActive: true
      });

      const newSettings = await settings.save();
      vendor.paymentSettingsId = newSettings._id;
      await vendor.save();
      
      recordAuditLog(req.user._id, "CREATE_PAYMENT_SETTINGS", "PaymentSettings", newSettings._id);
      return res.status(201).json(newSettings);
    }
  } catch (error) {
    console.error("Payment settings error:", error);
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get payment settings for vendor
// @route   GET /api/vendors/:vendorId/payment-settings
// @access  Private
export const getPaymentSettings = async (req, res) => {
  try {
    const { vendorId } = req.params;
    
    const settings = await PaymentSettings.findOne({ vendorId });
    if (!settings) {
      return res.status(404).json({ message: "No payment settings found" });
    }
    
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete payment settings
// @route   DELETE /api/vendors/:vendorId/payment-settings
// @access  Private/Admin
export const deletePaymentSettings = async (req, res) => {
  try {
    const { vendorId } = req.params;
    
    const settings = await PaymentSettings.findOneAndDelete({ vendorId });
    if (!settings) {
      return res.status(404).json({ message: "Payment settings not found" });
    }
    
    // Unlink from vendor
    const vendor = await Vendor.findByIdAndUpdate(vendorId, {
      $unset: { paymentSettingsId: "" }
    });
    
    recordAuditLog(req.user._id, "DELETE_PAYMENT_SETTINGS", "PaymentSettings", settings._id);
    res.json({ message: "Payment settings deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Auto-create Paystack subaccount for vendor (Admin only)
// @route   POST /api/vendors/:vendorId/payment-settings/subaccount
// @access  Private/Admin
export const createPaystackSubaccount = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ message: "Admin only" });
    }

    const { vendorId } = req.params;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    if (vendor.paymentDetails?.subaccountCode) {
      return res.status(400).json({ 
        message: "Subaccount already exists", 
        subaccountCode: vendor.paymentDetails.subaccountCode 
      });
    }

    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
    const response = await axios.post('https://api.paystack.co/subaccount', {
      business_name: vendor.businessName,
      settlement_bank: vendor.paymentDetails?.bankCode,
      settlement_account: vendor.paymentDetails?.accountNumber,
      percentage_charge: vendor.percentageCharge || 0,
      split_config: {
        split_type: "percentage",
        commission_enabled: true
      }
    }, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.status) {
      // Update vendor
      vendor.paymentDetails.subaccountCode = response.data.data.subaccount_code;
      await vendor.save();

      recordAuditLog(req.user._id, "CREATE_PAYSTACK_SUBACCOUNT", "Vendor", vendorId);
      
      res.json({
        success: true,
        subaccountCode: response.data.data.subaccount_code,
        message: "Subaccount created successfully"
      });
    } else {
      res.status(400).json({ message: response.data.message });
    }
  } catch (error) {
    console.error("Subaccount creation error:", error.response?.data);
    res.status(500).json({ message: error.response?.data?.message || error.message });
  }
};

