import express from "express";
import { geBanks, verifyAccount, getPayments, getPaymentStats, getTrends, getPaymentInfo, initializePayment, verifyPayment } from "../controllers/payment.controller.js";
import {protect} from "../middlewares/auth.middleware.js"

const router = express.Router();

router.get("/banks", geBanks);
router.get('/verify-account', verifyAccount)
router.get("/", protect, getPayments)
router.get("/stats", protect, getPaymentStats)
router.get("/earnings-trend", protect, getTrends)
router.get("/payment-info", protect, getPaymentInfo)
router.post("/initialize", protect, initializePayment)
router.post("/verify", protect, verifyPayment)

export default router;
