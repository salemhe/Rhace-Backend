import express from "express";
import {
  register,
  login,
  loginAdmin,
  forgotPassword,
  resetPassword,
  verifyOTP, // New import
  resendOTP, // New import
  registerAdmin,
  refreshAccessToken,
  logout,
} from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/register", register);
router.post("/register-admin", registerAdmin);
router.post("/login", login);
router.post("/admin/login", loginAdmin);
router.post("/verify-otp", verifyOTP); // New route
router.post("/resend-otp", resendOTP); // New route
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/refresh", refreshAccessToken);
router.post("/logout", logout);

export default router;