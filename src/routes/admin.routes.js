import express from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import { getVendors } from "../controllers/vendor.controller.js";

const router = express.Router();

router.get("/vendors", protect, authorize(["admin"]), getVendors);

export default router;
