import express from "express";
import {protect} from "../middlewares/auth.middleware.js"
import { forgotPassword, loginVendor, onboardVendor, registerVendor, resendOTP, resetPassword, verifyOTP } from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/auth/register", registerVendor);

// Vendor login route
router.post("/auth/login", loginVendor);

router.post("/auth/verify-otp", verifyOTP)

router.post("/auth/resend-otp", resendOTP)

router.post("/auth/forgot-password", forgotPassword)

router.post("/auth/reset-password", resetPassword)

router.post("/auth/onboard", protect, onboardVendor)

export default router;
