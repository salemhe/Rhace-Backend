import express from "express";
import {
  createMenu,
  getMenus,
  updateMenu,
  deleteMenu,
  createMenuItem,
  getMenuItems,
  updateMenuItem,
  deleteMenuItem,
  reorderMenuItemImages,
  exportMenusCSV,
  exportMenuItemsCSV,
  bulkAssignMenusToBranches,
} from "../controllers/menu.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { uploadMenuImages } from "../middlewares/menuImage.middleware.js"; // New import

const router = express.Router();

router.post("/", protect, uploadMenuImages, createMenu);
router.get("/", protect, getMenus);
router.get("/export-csv", protect, exportMenusCSV); // New route for exporting menus
router.put("/:id", protect, uploadMenuImages, updateMenu);
router.delete("/:id", protect, deleteMenu);

router.post("/items", protect, createMenuItem);
router.get("/items", getMenuItems);
router.get("/items/export-csv", protect, exportMenuItemsCSV); // New route for exporting menu items
router.put("/items/:id", protect, updateMenuItem);
router.delete("/items/:id", protect, deleteMenuItem);
router.put("/items/:id/reorder-images", protect, reorderMenuItemImages);

router.put("/bulk-assign", protect, bulkAssignMenusToBranches);

export default router;
