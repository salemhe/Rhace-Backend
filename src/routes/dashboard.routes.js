import express from "express";
import { protect } from "../middlewares/auth.middleware.js";
import {
  getKPIs,
  getUpcomingReservations,
  getTodaysReservations,
  getBookingTrends,
  getRevenueTrends,
  getCustomerFrequency,
  getRevenueByCategory,
  getReservationSources,
} from "../controllers/dashboard.controller.js";

const router = express.Router();

router.get("/kpis", protect, getKPIs);
router.get("/upcoming-reservations", protect, getUpcomingReservations);
router.get("/todays-reservations", protect, getTodaysReservations);
router.get("/booking-trends", protect, getBookingTrends);
router.get("/revenue-trends", protect, getRevenueTrends);
router.get("/customer-frequency", protect, getCustomerFrequency);
router.get("/revenue-by-category", protect, getRevenueByCategory);
router.get("/reservation-sources", protect, getReservationSources);

export default router;
