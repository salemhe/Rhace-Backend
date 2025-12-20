import express from "express";
import {
  initiatePayout,
  getAllPayouts,
  getPayoutById,
  approvePayout,
  getPayoutsForVendor,
} from "../controllers/payout.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);

// Route to initiate a payout (e.g., for finance and admin roles)
router.post("/", authorize(["finance", "superadmin", "admin"]), initiatePayout);

// Route to get all payouts (e.g., for finance and admin roles)
router.get("/", authorize(["finance", "superadmin", "admin"]), getAllPayouts);

// Route to get payouts for a specific vendor
router.get("/vendor/:vendorId", authorize(["finance", "superadmin", "admin"]), getPayoutsForVendor);

// Route to get a single payout by its ID
router.get("/:id", authorize(["finance", "superadmin", "admin"]), getPayoutById);

// Route to approve a payout (e.g., only for senior finance or admin roles)
router.patch("/:id/approve", authorize(["finance", "superadmin", "admin"]), approvePayout);

export default router;
