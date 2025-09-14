import express from "express";
import {
  createGuest,
  getGuests,
  getGuestById,
  updateGuest,
  deleteGuest,
} from "../controllers/guest.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

const router = express.Router();

router.use(protect); // All guest routes require authentication

router.route("/")
  .post(authorize(["admin", "manager", "staff"]), createGuest)
  .get(authorize(["admin", "manager", "staff"]), getGuests);

router.route("/:id")
  .get(authorize(["admin", "manager", "staff"]), getGuestById)
  .put(authorize(["admin", "manager", "staff"]), updateGuest)
  .delete(authorize(["admin"]), deleteGuest);

export default router;
