import { verifyAccessToken } from "../utils/jwt.js";
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
      if (req.headers.authorization.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
      }

      if (!token) return res.status(403).json({ message: 'Unauthorized'});

      const decoded = verifyAccessToken(token);

      if (decoded.role === "vendor") {
        req.user = await Vendor.findById(decoded.id).select(
          "_id role vendorType isOnboarded",
        );
      } else {
        req.user = await User.findById(decoded.id).select("_id role");
      }

      // Ensure user exists
      if (!req.user) {
        return res
          .status(401)
          .json({ message: "Not authorized, user not found", error: "jwt expired" });
      }

      console.log(`Authenticated user: ${req.user._id} with role: ${req.user.role} & ${decoded.role}`);

      // Set the role from the JWT token to ensure correct authorization
      req.user.role = decoded.role;

      // Check if vendor is onboarded
      if (decoded.role === "vendor" && !req.user.isOnboarded) {
        return res.status(403).json({
          message:
            "Forbidden: Please complete vendor onboarding before accessing this resource.",
          isOnboarded: false,
        });
      }

      next();
    } catch (error) {
      res.status(401).json({ message: "Not authorized", error: error.message });
    }
  }
};
