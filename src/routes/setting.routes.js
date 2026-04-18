import express from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import {
  getSettings,
  updateSettings,
  getAccountSettings,
  updateAccountSettings,
} from "../controllers/setting.controller.js";

const router = express.Router();

router.use(protect());

// System settings (Superadmin and Admin only)
router.get("/", authorize(["superadmin", "admin"]), getSettings);
router.put("/", authorize(["superadmin", "admin"]), updateSettings);

// User account settings
router.get("/account", getAccountSettings);
router.put("/account", updateAccountSettings);

export default router;
