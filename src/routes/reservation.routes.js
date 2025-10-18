import express from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import {
  getReservations,
  getReservationById,
  updateReservationStatus,
  addMealSelection,
  waiveNoShowPenalty,
  getReservationCounters,
  exportReservations,
} from "../controllers/reservation.controller.js";

const router = express.Router();

router.use(protect);

router.get("/", authorize(["superadmin", "finance", "ops", "support"]), getReservations);
router.get("/counters", authorize(["superadmin", "finance", "ops", "support"]), getReservationCounters);
router.get("/export", authorize(["superadmin", "finance", "ops", "support"]), exportReservations);

router.route("/:id")
  .get(authorize(["superadmin", "finance", "ops", "support"]), getReservationById);

router.patch("/:id/status", authorize(["superadmin", "finance", "ops"]), updateReservationStatus);
router.post("/:id/meals", authorize(["superadmin", "finance", "ops", "vendor"]), addMealSelection);
router.patch("/:id/penalty/waive", authorize(["superadmin"]), waiveNoShowPenalty);

export default router;
