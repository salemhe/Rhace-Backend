import { verifyAccessToken } from "../utils/jwt.js";
import User from "../models/user.model.js";
import { Vendor } from "../models/vendor.model.js";

export const protect = (options = { onboarding: false }) => {
  return async (req, res, next) => {
    let token;

    // 1. Token Extraction logic
    if (req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) return res.status(403).json({ message: 'Unauthorized' });

    try {
      const decoded = verifyAccessToken(token);

      // 2. Fetch User/Vendor
      if (decoded.role === "vendor") {
        req.user = await Vendor.findById(decoded.id).select(
          "_id role vendorType isOnboarded",
        );
      } else {
        req.user = await User.findById(decoded.id).select("_id role");
      }

      if (!req.user) {
        return res.status(401).json({ message: "User not found" });
      }

      // 3. The "Onboarding" Logic
      // If the route is NOT an onboarding route, but the vendor hasn't onboarded, BLOCK.
      if (decoded.role === "vendor" && !req.user.isOnboarded && !options.onboarding) {
        return res.status(403).json({
          message: "Forbidden: Please complete onboarding first.",
          isOnboarded: false,
        });
      }

      next();
    } catch (error) {
      res.status(401).json({ message: "Not authorized", error: error.message });
    }
  };
};