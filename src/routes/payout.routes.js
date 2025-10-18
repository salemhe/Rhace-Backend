import express from "express";
import {
  initiatePayout,
  getAllPayouts,
  getPayoutById,
  approvePayout,
  getPayoutsForVendor,
} from "../controllers/payout.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
// import { checkPermission } from "../middlewares/permission.middleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);

// Route to initiate a payout (e.g., only for finance roles)
// router.post("/", checkPermission("initiate_payout"), initiatePayout);

// // Route to get all payouts (e.g., for finance and admin roles)
// router.get("/", checkPermission("view_payouts"), getAllPayouts);

// // Route to get payouts for a specific vendor
// router.get("/vendor/:vendorId", checkPermission("view_payouts"), getPayoutsForVendor);

// // Route to get a single payout by its ID
// router.get("/:id", checkPermission("view_payouts"), getPayoutById);

// // Route to approve a payout (e.g., only for senior finance or admin roles)
// router.patch("/:id/approve", checkPermission("approve_payout"), approvePayout);

export default router;
