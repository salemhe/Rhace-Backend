import express from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import {
  getPublicVendors,
  getVendors,
  getVendorById,
  updateVendorApproval,
  updateVendorStatus,
  updateVendorCommission,
  submitKYC,
  verifyKYC,
  updateBankAccount,
  verifyBankAccount,
  bulkUpdateVendors,
  exportVendors,
} from "../controllers/vendor.controller.js";
import { forgotVendorPassword, loginVendor, onboardVendor, registerVendor, resendVendorOTP, resetPassword, verifyVendorOTP } from "../controllers/auth.controller.js";
import upload from "../middlewares/upload.middleware.js";

const router = express.Router();

// Public routes (no auth required)
router.get("/public", getPublicVendors);

// Auth routes
router.post("/auth/register", registerVendor);
router.post("/auth/login", loginVendor);
router.post("/auth/verify-otp", verifyVendorOTP);
router.post("/auth/resend-otp", resendVendorOTP);
router.post("/auth/forgot-password", forgotVendorPassword);
router.post("/auth/reset-password", resetPassword);
router.post("/auth/onboard", protect, onboardVendor);

// Vendor management routes (Admin/Manager)
router.use(protect); // All routes below require authentication

router.get("/", authorize(["superadmin", "finance", "ops", "support"]), getVendors);
router.get("/export", authorize(["superadmin", "finance", "ops", "support"]), exportVendors);
router.post("/bulk-update", authorize(["superadmin"]), bulkUpdateVendors);

router.route("/:id")
  .get(authorize(["superadmin", "finance", "ops", "support"]), getVendorById);

router.patch("/:id/approval", authorize(["superadmin"]), updateVendorApproval);
router.patch("/:id/status", authorize(["superadmin", "finance", "ops"]), updateVendorStatus);
router.patch("/:id/commission", authorize(["superadmin"]), updateVendorCommission);

// KYC routes
router.post("/:id/kyc", protect, upload.any(), submitKYC); // Vendors can submit
router.patch("/:id/kyc/verify", authorize(["superadmin"]), verifyKYC); // Admins can verify

// Bank account routes
router.post("/:id/bank-account", protect, updateBankAccount); // Vendors/Admins can update
router.patch("/:id/bank-account/verify", authorize(["superadmin"]), verifyBankAccount); // Admins can verify

export default router;
