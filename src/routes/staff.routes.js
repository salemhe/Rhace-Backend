import express from "express";
import {
  createStaff,
  getStaff,
  exportStaffCSV,
  getStaffById,
  updateStaff,
  modifyStaffRoles,
  toggleStaffStatus,
  deleteStaff,
} from "../controllers/staff.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import { uploadStaffAvatar } from "../middlewares/staffImage.middleware.js"; // New import

const router = express.Router();

router.post("/", protect(), authorize(["admin", "manager", "vendor"]), uploadStaffAvatar, createStaff);
router.get("/", protect(), authorize(["admin", "manager", "staff", "vendor"]), getStaff);
router.get("/export-csv", protect(), authorize(["admin", "manager"]), exportStaffCSV);

router.route("/:id")
  .get(protect(), authorize(["admin", "manager", "staff", "vendor"]), getStaffById)
  .put(protect(), authorize(["admin", "manager", "vendor"]), uploadStaffAvatar, updateStaff)
  .delete(protect(), authorize(["admin", "user"]), deleteStaff);

router.patch("/:id/roles", protect(), authorize(["admin", "manager"]), modifyStaffRoles);
router.patch("/:id/status", protect(), authorize(["admin", "manager"]), toggleStaffStatus);

export default router;
