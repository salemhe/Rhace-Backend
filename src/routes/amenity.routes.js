import express from "express";
import {
  createAmenity,
  getAmenities,
} from "../controllers/amenity.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

const router = express.Router();

router.use(protect);

router.route("/")
  .post(createAmenity)
  .get(getAmenities);

export default router;
