import express from "express";
import {
  createReservation,
  getReservations,
} from "../controllers/reservation.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/", protect, createReservation);
router.get("/", protect, getReservations);

export default router;