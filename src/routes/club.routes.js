
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
  .post(authorize(["admin", "vendor"]), createClub)
  .get(authorize(["admin", "vendor", "staff"]), getClubs);

router.route("/:id")
  .get(authorize(["admin", "vendor", "staff"]), getClubById)
  .put(authorize(["admin", "vendor"]), updateClub)
  .delete(authorize(["admin", "vendor"]), deleteClub);

router.patch("/:id/status", authorize(["admin", "vendor"]), updateClubStatus);

// Table Types
router.route("/:clubId/table-types")
  .post(authorize(["admin"]), createTableType)
  .get(authorize(["admin", "vendor", "staff"]), getTableTypes);

router.route("/:clubId/table-types/:tableTypeId")
  .get(authorize(["admin", "vendor", "staff"]), getTableTypeById)
  .put(authorize(["admin"]), updateTableType)
  .delete(authorize(["admin"]), deleteTableType);

// Booking Rules
router.route("/:clubId/booking-rules")
  .get(authorize(["admin", "vendor", "staff"]), getBookingRules)
  .put(authorize(["admin"]), updateBookingRules);

router.patch("/:id/publish", authorize(["admin", "vendor"]), publishClub);

export default router;
