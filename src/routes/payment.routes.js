import express from "express";
import { geBanks, verifyAccount, getPayments, getPaymentStats, getTrends, getPaymentInfo } from "../controllers/payment.controller.js";
import {protect} from "../middlewares/auth.middleware.js"

const router = express.Router();

router.get("/banks", geBanks);
router.get('/verify-account', verifyAccount)
router.get("/", protect, getPayments)
router.get("/stats", protect, getPaymentStats)
router.get("/earnings-trend", protect, getTrends)
router.get("/payment-info", protect, getPaymentInfo)

export default router;
