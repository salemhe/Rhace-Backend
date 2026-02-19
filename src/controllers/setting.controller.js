import AccountSettings from "../models/accountsettings.model.js";
import SystemSettings from "../models/systemsettings.model.js";
import { recordAuditLog } from "../utils/auditLogger.js";

// @desc    Get system settings
// @route   GET /api/settings
// @access  Private (Admin)
export const getSettings = async (req, res) => {
  try {
    const settings = await SystemSettings.find({});
    const settingsMap = {};

    // Default settings
    const defaultSettings = {
      general: {
        platformName: "Rhace",
        bookingWindowLimit: 30, // days
        supportEmail: "support@rhace.co",
        supportPhone: "+2341234567890",
        defaultCurrency: "NGN",
        defaultTimezone: "Africa/Lagos",
      },
      vendor: {
        approvalProcess: "manual", // auto/manual
        allowedServiceTypes: ["hotel", "restaurant", "club"],
        autoApproval: false,
        requiredOnboardingFields: ["businessName", "email", "phone", "address"],
        defaultCommissionRate: 10, // percentage
        onboardingMessage: "Welcome to Rhace! Please complete your profile.",
      },
      reservation: {
        minLeadTimeHours: 2,
        cutOffTimeMinutes: 60,
        maxPartySize: 20,
        allowSameDayBookings: true,
      },
      payment: {
        payoutMinAmount: 1000,
        payoutMaxAmount: 500000,
        payoutSchedule: "weekly", // daily/weekly/monthly
        supportedCurrencies: ["NGN", "USD", "EUR"],
      },
      notifications: {
        emailEnabled: true,
        smsEnabled: true,
        whatsappEnabled: false,
        templates: {
          vendorApproval: "Your vendor account has been approved.",
          payoutProcessed: "Your payout of {amount} has been processed.",
        },
      },
      security: {
        sessionTimeout: 24, // hours
        passwordMinLength: 8,
        twoFactorRequired: false,
        roles: ["superadmin", "finance", "ops", "support"],
      },
    };

    // Merge with stored settings
    settings.forEach(setting => {
      settingsMap[setting.category] = setting.settings;
    });

    const mergedSettings = { ...defaultSettings, ...settingsMap };

    res.status(200).json(mergedSettings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update system settings
// @route   PUT /api/settings
// @access  Private (Superadmin)
export const updateSettings = async (req, res) => {
  try {
    const settingsData = req.body;

    // Validate the entire settings object
    for (const [category, settings] of Object.entries(settingsData)) {
      switch (category) {
        case "general":
          if (settings.bookingWindowLimit < 1 || settings.bookingWindowLimit > 365) {
            return res.status(400).json({ message: "Invalid booking window limit" });
          }
          break;
        case "vendor":
          if (settings.defaultCommissionRate < 0 || settings.defaultCommissionRate > 50) {
            return res.status(400).json({ message: "Invalid commission rate" });
          }
          break;
        case "payment":
          if (settings.payoutMinAmount < 100 || settings.payoutMaxAmount > 10000000) {
            return res.status(400).json({ message: "Invalid payout amount range" });
          }
          break;
      }
    }

    // Save each category to database
    const updatePromises = Object.entries(settingsData).map(async ([category, settings]) => {
      await SystemSettings.findOneAndUpdate(
        { category },
        { settings },
        { upsert: true, new: true }
      );
    });

    await Promise.all(updatePromises);

    await recordAuditLog(req.user._id, "SETTINGS_UPDATE", "Settings", null, {
      updatedBy: req.user._id,
      changes: settingsData,
    });

    // Return the updated settings
    const updatedSettings = await SystemSettings.find({});
    const settingsMap = {};
    updatedSettings.forEach(setting => {
      settingsMap[setting.category] = setting.settings;
    });

    res.status(200).json(settingsMap);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get user account settings
// @route   GET /api/settings/account
// @access  Private
export const getAccountSettings = async (req, res) => {
  try {
    let settings = await AccountSettings.findOne({ user: req.user._id });

    if (!settings) {
      settings = new AccountSettings({ user: req.user._id });
      await settings.save();
    }

    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user account settings
// @route   PUT /api/settings/account
// @access  Private
export const updateAccountSettings = async (req, res) => {
  try {
    const { currency, timezone, defaultPolicies } = req.body;

    let settings = await AccountSettings.findOne({ user: req.user._id });

    if (!settings) {
      settings = new AccountSettings({ user: req.user._id });
    }

    settings.currency = currency || settings.currency;
    settings.timezone = timezone || settings.timezone;
    settings.defaultPolicies = defaultPolicies || settings.defaultPolicies;

    await settings.save();

    res.status(200).json(settings);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
