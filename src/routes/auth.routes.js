import express from "express";
import {
  register,
  login,
  forgotPassword,
  resetPassword,
  verifyOTP, // New import
  resendOTP, // New import
  registerAdmin,
} from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/register", register);
router.post("/register-admin", registerAdmin);
router.post("/login", login);
router.post("/verify-otp", verifyOTP); // New route
router.post("/resend-otp", resendOTP); // New route
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

export default router;