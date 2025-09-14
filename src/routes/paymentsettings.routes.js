import express from "express";
import {
  createOrUpdatePaymentSettings,
  getPaymentSettings,
  deletePaymentSettings,
} from "../controllers/paymentsettings.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

const router = express.Router({ mergeParams: true });

router.use(protect);

router.route("/")
  .post(authorize(["admin", "manager"]), createOrUpdatePaymentSettings) // Use POST for create/update for simplicity, can be PUT for update only
  .get(authorize(["admin", "manager", "staff"]), getPaymentSettings)
  .delete(authorize(["admin"]), deletePaymentSettings);

export default router;
