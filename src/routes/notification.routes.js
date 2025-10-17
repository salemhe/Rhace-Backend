import express from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  sendNotification,
  sendBulkNotifications,
  getNotificationTemplates,
} from "../controllers/notification.controller.js";

const router = express.Router();

router.use(protect);

// User notification routes
router.get("/", getNotifications);
router.patch("/:id/read", markAsRead);
router.patch("/mark-all-read", markAllAsRead);
router.delete("/:id", deleteNotification);

// Admin notification routes
router.post("/send", authorize(["superadmin", "support"]), sendNotification);
router.post("/bulk-send", authorize(["superadmin", "support"]), sendBulkNotifications);
router.get("/templates", authorize(["superadmin", "support"]), getNotificationTemplates);

export default router;
