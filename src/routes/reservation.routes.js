
import express from "express";
import {
  createReservation,
  getReservations,
  getReservationById,
  updateReservation,
  deleteReservation,
} from "../controllers/reservation.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

const router = express.Router();

router.use(protect);

router.route("/")
  .post(authorize(["admin", "staff"]), createReservation)
  .get(authorize(["admin", "manager", "staff"]), getReservations);

router.route("/:id")
  .get(authorize(["admin", "manager", "staff"]), getReservationById)
  .put(authorize(["admin", "staff"]), updateReservation)
  .delete(authorize(["admin"]), deleteReservation);

export default router;
