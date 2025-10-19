import express from "express";
import {protect} from "../middlewares/auth.middleware.js"
import { getVendor, forgotVendorPassword, loginVendor, onboardVendor, registerVendor, resendVendorOTP, resetPassword, verifyVendorOTP } from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/auth/register", registerVendor);

router.get("/", getVendor)

// Vendor login route
router.post("/auth/login", loginVendor); // Unified login for vendors and admins

router.post("/auth/verify-otp", verifyVendorOTP)

router.post("/auth/resend-otp", resendVendorOTP)

router.post("/auth/forgot-password", forgotVendorPassword)

router.post("/auth/reset-password", resetPassword)

router.post("/auth/onboard", protect, onboardVendor)

export default router;
