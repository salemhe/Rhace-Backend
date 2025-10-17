import express from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import {
  getVendorEarnings,
  initiatePayout,
  getPayouts,
  approvePayout,
  exportPayouts,
  getPayoutReceipt,
} from "../controllers/payment.controller.js";

const router = express.Router();

router.use(protect);

// Vendor earnings
router.get("/vendor-earnings/:vendorId", authorize(["superadmin", "finance", "ops"]), getVendorEarnings);

// Payouts
router.post("/payout", authorize(["superadmin", "finance"]), initiatePayout);
router.get("/payouts", authorize(["superadmin", "finance", "ops"]), getPayouts);
router.get("/payouts/export", authorize(["superadmin", "finance", "ops"]), exportPayouts);
router.patch("/payouts/:id/approve", authorize(["superadmin", "finance"]), approvePayout);
router.get("/payouts/:id/receipt", authorize(["superadmin", "finance", "ops"]), getPayoutReceipt);

export default router;
