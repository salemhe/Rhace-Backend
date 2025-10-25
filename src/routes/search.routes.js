import express from "express";
import { getVendorSuggestions, getVendors } from "../controllers/search.controller.js";

const router = express.Router();

router.get("/suggestions", getVendorSuggestions);
router.get("/", getVendors);

export default router;
