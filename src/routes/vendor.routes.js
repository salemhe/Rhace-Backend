import express from "express";
import {protect} from "../middlewares/auth.middleware.js"
import { getOffers, getNearest, getVendorById } from "../controllers/vendor.controller.js"
import { getVendor, forgotVendorPassword, loginVendor, onboardVendor, registerVendor, resendVendorOTP, resetPassword, verifyVendorOTP, } from "../controllers/auth.controller.js";
 

const router = express.Router();

router.post("/auth/register", registerVendor);

router.get("/", getVendor)
router.get("/:id", protect, getVendorById)

router.get("/offers", getOffers);

router.get("/nearest", getNearest)

// Vendor login route
router.post("/auth/login", loginVendor); // Unified login for vendors and admins

router.post("/auth/verify-otp", verifyVendorOTP)

router.post("/auth/resend-otp", resendVendorOTP)

router.post("/auth/forgot-password", forgotVendorPassword)

router.post("/auth/reset-password", resetPassword)

router.post("/auth/onboard", protect, onboardVendor)

// Diagnostic endpoint to check token
router.get("/auth/me", protect, (req, res) => {
  res.json({
    message: "Token is valid",
    user: {
      id: req.user._id,
      role: req.user.role,
      vendorType: req.user.vendorType,
      isOnboarded: req.user.isOnboarded
    }
  });
});

export default router;
