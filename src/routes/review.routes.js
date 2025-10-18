import express from "express";
import {
  createReview,
  getReviewsForClub,
  updateReview,
  deleteReview,
} from "../controllers/review.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

const router = express.Router();

// Public route to get reviews for a club
router.get("/", getReviewsForClub);

// Protected routes
router.use(protect);

router.route("/")
  .post(authorize(["guest", "admin", "manager", "staff"]), createReview);

router.route("/:id")
  .put(authorize(["guest", "admin", "manager", "staff"]), updateReview)
  .delete(authorize(["guest", "admin", "manager", "staff"]), deleteReview);

export default router;
