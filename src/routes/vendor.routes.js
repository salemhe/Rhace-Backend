import express from "express";
import upload from "../middlewares/upload.middleware.js";
import { loginVendor, registerVendor } from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/auth/register", registerVendor);

// Vendor login route
router.post("/auth/login", loginVendor);

export default router;
