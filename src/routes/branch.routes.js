import express from "express";
import { createBranch, getBranches } from "../controllers/branch.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/", protect, createBranch);
router.get("/", protect, getBranches);

export default router;