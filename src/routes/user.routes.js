import express from "express";
import { login, register, resendOTP, verifyOTP, forgotPassword, resetPassword, loginGoogle, registerGoogle } from "../controllers/auth.controller.js";
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
  resetUserPassword,
  toggleVIPStatus,
  getUserStats,
  exportUsers,
} from "../controllers/user.controller.js";

const router = express.Router();

// User management routes
router.get("/", getUsers);
router.get("/stats", getUserStats);
router.get("/:id", getUserById);
router.post("/", createUser);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);
router.patch("/:id/status", toggleUserStatus);
router.post("/:id/reset-password", resetUserPassword);
router.patch("/:id/vip", toggleVIPStatus);
router.get("/export", exportUsers);

// Auth routes
router.post("/auth/register", register);
router.post("/auth/register/google", registerGoogle);
router.post("/auth/login", login);
router.post("/auth/login/google", loginGoogle)
router.post("/auth/verify-otp", verifyOTP);
router.post("/auth/resend-otp", resendOTP);
router.post("/auth/forgot-password", forgotPassword);
router.post("/auth/reset-password", resetPassword);

export default router;
