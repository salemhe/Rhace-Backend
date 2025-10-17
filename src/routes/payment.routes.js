import express from "express";
import { geBanks, verifyAccount, getPayments, getPaymentStats, getTrends, getPaymentInfo, initializePayment, verifyPayment } from "../controllers/payment.controller.js";
import {protect} from "../middlewares/auth.middleware.js"
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


router.get("/banks", geBanks);
router.get('/verify-account', verifyAccount)
router.get("/", protect, getPayments)
router.get("/stats", protect, getPaymentStats)
router.get("/earnings-trend", protect, getTrends)
router.get("/payment-info", protect, getPaymentInfo)
router.post("/initialize", protect, initializePayment)
router.post("/verify", protect, verifyPayment)

export default router;
