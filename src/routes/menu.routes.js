import express from "express";
import {
  createMenu,
  getMenus,
  createMenuItem,
  getMenuItems,
} from "../controllers/menu.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/", protect, createMenu);
router.get("/", protect, getMenus);
router.post("/items", protect, createMenuItem);
router.get("/items", protect, getMenuItems);

export default router;