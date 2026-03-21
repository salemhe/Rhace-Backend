import express from "express";
import { handlePaystack } from "../controllers/paystack.controller.js";

const router = express.Router();

// Paystack Webhook - NO AUTH MIDDLEWARE (raw access required)
// Expects raw JSON body + x-paystack-signature header
router.post("/webhook", express.raw({ type: "*/*" }), handlePaystack);

export default router;

