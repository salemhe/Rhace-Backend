import { verifyToken } from "../utils/jwt.js";
import User from "../models/user.model.js";
import { Vendor } from "../models/vendor.model.js";

export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(" ")[1];

            // Verify token
      const decoded = verifyToken(token);
      console.log("Decoded token:", { id: decoded.id, role: decoded.role, isOnboarded: decoded.isOnboarded });

      if (decoded.role === "vendor") {
        req.user = await Vendor.findById(decoded.id).select("_id role vendorType isOnboarded");
      } else {
        req.user = await User.findById(decoded.id).select("_id role");
      }

      // Ensure user exists
      if (!req.user) {
        return res.status(401).json({ message: "Not authorized, user not found" });
      }

      // Set the role from the JWT token to ensure correct authorization
      req.user.role = decoded.role;
      console.log("User after auth middleware:", { id: req.user._id, role: req.user.role, isOnboarded: req.user.isOnboarded });

            // Check if vendor is onboarded
      if (decoded.role === "vendor" && !req.user.isOnboarded) {
        return res.status(403).json({ 
          message: "Forbidden: Please complete vendor onboarding before accessing this resource.",
          isOnboarded: false 
        });
      }

      next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({ message: "Not authorized, token failed" });
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }
};
