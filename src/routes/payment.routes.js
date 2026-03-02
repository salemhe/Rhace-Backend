import express from "express";
import { getBanks, verifyAccount, getPayments, getPaymentStats, getTrends, getPaymentInfo, initializePayment, verifyPayment, getVendorsEarnings, getAdminTotalEarnings, getTotalSuccessfulPayments } from "../controllers/payment.controller.js";
import {protect} from "../middlewares/auth.middleware.js"

const router = express.Router();

router.get("/banks", getBanks);
router.get('/verify-account', verifyAccount)
router.get("/", protect, getPayments)
router.get("/stats", protect, getPaymentStats)
router.get("/earnings-trend", protect, getTrends)
router.get("/payment-info", protect, getPaymentInfo)
router.get("/vendors-earnings", protect, getVendorsEarnings)
router.get("/admin-earnings", protect, getAdminTotalEarnings)
router.get("/successful-count", protect, getTotalSuccessfulPayments)
router.post("/initialize", protect, initializePayment)
router.post("/verify", protect, verifyPayment)

export default router;
