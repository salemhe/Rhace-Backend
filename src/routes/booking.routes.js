import express from "express";
import {
  createReservation,
  getBookingSummary,
  getReservations,
  getReservationStats,
} from "../controllers/booking.controller.js";
import { protect } from "../middlewares/auth.middleware.js";


const router = express.Router();

router.post("/create", protect, createReservation)

router.get("/", protect, getReservations)

router.get("/stats", protect, getReservationStats)

router.get("/summary", protect, getBookingSummary)

export default router;