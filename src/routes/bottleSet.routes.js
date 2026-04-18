
import express from "express";
import {
  createBottleSet,
  getBottleSets,
  getBottleSetById,
  updateBottleSet,
  deleteBottleSet,
} from "../controllers/bottleSet.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import { uploadBottleSetImages } from "../middlewares/bottleSetImage.middleware.js";

const router = express.Router();

router.use(protect());

router.route("/")
  .post(authorize(["admin", "vendor"]), uploadBottleSetImages, createBottleSet)
  .get(authorize(["admin", "staff", "vendor", "user"]), getBottleSets);

router.route("/:id")
  .get(authorize(["admin", "vendor", "staff"]), getBottleSetById)
  .put(authorize(["admin", "vendor"]), uploadBottleSetImages, updateBottleSet)
  .delete(authorize(["admin", "vendor"]), deleteBottleSet);

export default router;
