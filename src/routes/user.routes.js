import express from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
  resetUserPassword,
  toggleVIPStatus,
  exportUsers,
} from "../controllers/user.controller.js";
import { login, register, resendOTP, verifyOTP, forgotPassword, resetPassword } from "../controllers/auth.controller.js";

const router = express.Router();

// Auth routes
router.post("/auth/register", register);
router.post("/auth/login", login);
router.post("/auth/verify-otp", verifyOTP);
router.post("/auth/resend-otp", resendOTP);
router.post("/auth/forgot-password", forgotPassword);
router.post("/auth/reset-password", resetPassword);

// User management routes (Admin only)
router.use(protect); // All routes below require authentication

router.get("/", authorize(["superadmin", "finance", "ops", "support"]), getUsers);
router.get("/export", authorize(["superadmin", "finance", "ops", "support"]), exportUsers);
router.post("/", authorize(["superadmin"]), createUser);

router.route("/:id")
  .get(authorize(["superadmin", "finance", "ops", "support"]), getUserById)
  .put(authorize(["superadmin", "finance", "ops"]), updateUser)
  .delete(authorize(["superadmin"]), deleteUser);

router.patch("/:id/status", authorize(["superadmin", "finance", "ops"]), toggleUserStatus);
router.post("/:id/reset-password", authorize(["superadmin"]), resetUserPassword);
router.patch("/:id/vip", authorize(["superadmin", "finance", "ops"]), toggleVIPStatus);

export default router;
