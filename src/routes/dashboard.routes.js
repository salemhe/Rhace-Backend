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
  getTopVendors,
  getVendorsEarnings,
  getRecentTransactions,
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
router.get("/top-vendors", protect, getTopVendors);
router.get("/vendors-earnings", protect, getVendorsEarnings);
router.get("/recent-transactions", protect, getRecentTransactions);

export default router;