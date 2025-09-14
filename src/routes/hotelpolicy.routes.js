import express from "express";
import {
  createOrUpdateHotelPolicy,
  getHotelPolicy,
  deleteHotelPolicy,
} from "../controllers/hotelpolicy.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

const router = express.Router({ mergeParams: true });

router.use(protect);

router.route("/")
  .post(authorize(["admin", "manager"]), createOrUpdateHotelPolicy) // Use POST for create/update for simplicity, can be PUT for update only
  .get(authorize(["admin", "manager", "staff"]), getHotelPolicy)
  .delete(authorize(["admin"]), deleteHotelPolicy);

export default router;
