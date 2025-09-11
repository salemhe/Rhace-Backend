import express from "express";
import {
  createPayment,
  getPayments,
} from "../controllers/payment.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/", protect, createPayment);
router.get("/", protect, getPayments);

export default router;