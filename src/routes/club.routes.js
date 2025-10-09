
import express from "express";
import {
  createClub,
  getClubs,
  getClubById,
  updateClub,
  deleteClub,
  updateClubStatus,
  createTableType,
  getTableTypes,
  getTableTypeById,
  updateTableType,
  deleteTableType,
  getBookingRules,
  updateBookingRules,
} from "../controllers/club.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

const router = express.Router();

router.use(protect); // All club routes require authentication

router.route("/")
  .post(authorize(["admin"]), createClub)
  .get(authorize(["admin", "manager", "staff"]), getClubs);

router.route("/:id")
  .get(authorize(["admin", "manager", "staff"]), getClubById)
  .put(authorize(["admin"]), updateClub)
  .delete(authorize(["admin"]), deleteClub);

router.patch("/:id/status", authorize(["admin"]), updateClubStatus);

// Table Types
router.route("/:clubId/table-types")
  .post(authorize(["admin"]), createTableType)
  .get(authorize(["admin", "manager", "staff"]), getTableTypes);

router.route("/:clubId/table-types/:tableTypeId")
  .get(authorize(["admin", "manager", "staff"]), getTableTypeById)
  .put(authorize(["admin"]), updateTableType)
  .delete(authorize(["admin"]), deleteTableType);

// Booking Rules
router.route("/:clubId/booking-rules")
  .get(authorize(["admin", "manager", "staff"]), getBookingRules)
  .put(authorize(["admin"]), updateBookingRules);

export default router;
