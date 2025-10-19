import express from "express";
import {
  createReservation,
  getReservations,
} from "../controllers/booking.controller.js";
import { protect } from "../middlewares/auth.middleware.js";


const router = express.Router();

router.post("/create", protect, createReservation)

router.get("/", protect, getReservations)

export default router;