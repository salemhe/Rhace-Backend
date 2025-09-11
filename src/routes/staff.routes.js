import express from "express";
import { createStaff, getStaff } from "../controllers/staff.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/", protect, createStaff);
router.get("/", protect, getStaff);

export default router;