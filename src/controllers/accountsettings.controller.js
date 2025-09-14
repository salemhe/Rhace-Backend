import AccountSettings from "../models/accountsettings.model.js";

// @desc    Get account settings for the logged-in user
// @route   GET /api/account-settings
// @access  Private
export const getAccountSettings = async (req, res) => {
  try {
    const settings = await AccountSettings.findOne({ user: req.user._id });

    if (!settings) {
      // Return default settings if none exist
      return res.status(200).json({
        currency: "NGN",
        timezone: "UTC",
        defaultPolicies: {},
      });
    }

    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update account settings for the logged-in user
// @route   PUT /api/account-settings
// @access  Private
export const updateAccountSettings = async (req, res) => {
  try {
    const { currency, timezone, defaultPolicies, businessLogo } = req.body;

    const settings = await AccountSettings.findOneAndUpdate(
      { user: req.user._id },
      { currency, timezone, defaultPolicies, businessLogo },
      { new: true, upsert: true } // Create if doesn't exist
    );

    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
