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

      req.user =
        decoded.role === "vendor"
          ? await Vendor.findById(decoded.id).select("_id role vendorType")
          : await User.findById(decoded.id).select("_id");

      // Get user from the token

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
