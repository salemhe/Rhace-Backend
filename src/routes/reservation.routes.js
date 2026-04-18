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

router.use(protect());

router.get("/", authorize(["superadmin", "admin", "finance", "vendor" , "ops", "support"]), getReservations);
router.get("/counters", authorize(["superadmin", "admin", "finance", "ops", "support", "vendor"]), getReservationCounters);
router.get("/export", authorize(["superadmin", "admin", "finance", "ops", "support"]), exportReservations);

router.route("/:id")
  .get(authorize(["superadmin", "admin", "finance", "ops", "support"]), getReservationById);

router.patch("/:id/status", authorize(["superadmin", "admin", "finance", "vendor" , "ops"]), updateReservationStatus);
router.post("/:id/meals", authorize(["superadmin", "admin", "finance", "ops", "vendor"]), addMealSelection);
router.patch("/:id/penalty/waive", authorize(["superadmin", "admin"]), waiveNoShowPenalty);

export default router;