import express from "express";
import {
  createReservation,
  createMultiRoomReservation,
  getBookingSummary,
  getReservations,
  getReservationStats,
  completePayment,
} from "../controllers/booking.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/create", protect, createReservation)

router.post("/create-multi-room", protect, createMultiRoomReservation)

router.post("/complete-payment", protect, completePayment)

router.get("/", protect, getReservations)

router.get("/stats", protect, getReservationStats)

router.get("/summary", protect, getBookingSummary)

export default router;
