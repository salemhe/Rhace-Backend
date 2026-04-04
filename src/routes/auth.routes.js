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
  loginGoogle,
  loginVendor,
  verifyVendorOTP,
  resendVendorOTP,
  forgotVendorPassword,
  onboardVendor,
  registerVendor,
} from "../controllers/auth.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Users Auth
router.post("/users/login", login);
router.post("/users/register", register);
router.post("/users/verify-otp", verifyOTP);
router.post("/users/resend-otp", resendOTP); 
router.post("/users/forgot-password", forgotPassword);
router.post("/users/reset-password", resetPassword);
router.post("/users/login/google", loginGoogle)
router.post("/users/register/google", loginGoogle);

// Vendors Auth
router.post("/vendors/login", loginVendor);
router.post("/vendors/register", registerVendor);
router.post("/vendors/verify-otp", verifyVendorOTP)
router.post("/vendors/resend-otp", resendVendorOTP)
router.post("/vendors/forgot-password", forgotVendorPassword)
router.post("/vendors/reset-password", resetPassword)
router.post("/vendors/onboard", protect, onboardVendor)

// Admin Auth
router.post("/admin/register", registerAdmin);
router.post("/admin/login", loginAdmin);

export default router;