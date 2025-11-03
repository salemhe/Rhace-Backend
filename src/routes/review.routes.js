import express from "express";
import {
  createReview,
  getReviews,
  updateReview,
  deleteReview,
} from "../controllers/review.controller.js";
import { authorize } from "../middlewares/permission.middleware.js";

const router = express.Router();

// Public route to get reviews for a club
router.get("/:vendor", getReviews);

router.post("/create", createReview)

router.route("/:id")
  .put(authorize(["user", "admin", "manager", "staff"]), updateReview)
  .delete(authorize(["user", "admin", "manager", "staff"]), deleteReview);

export default router;
