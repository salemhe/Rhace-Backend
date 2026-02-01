import express from "express";
import { loginAdmin } from "../controllers/auth.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import { getVendors } from "../controllers/vendor.controller.js";

const router = express.Router();

router.post("/login", loginAdmin);
router.get("/vendors", protect, authorize(["superadmin", "admin", "manager"]), getVendors);

export default router;
