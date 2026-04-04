import express from "express";
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
  resetUserPassword,
  toggleVIPStatus,
  getUserStats,
  exportUsers,
  changePassword,
  updateProfilePicture,
} from "../controllers/user.controller.js";
import { addFavorite, deleteFavorites, getFavorites } from "../controllers/favorites.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import upload from "../middlewares/upload.middleware.js";

const router = express.Router();

// User management routes
router.get("/favorites", protect, getFavorites);
router.post("/favorites", protect, addFavorite);
router.delete("/favorites", protect, deleteFavorites);

// Profile routes (authenticated user)
router.put("/profile/password", protect, changePassword);
router.put("/profile/picture", protect, upload.single("profilePic"), updateProfilePicture);

router.get("/", getUsers);
router.get("/stats", getUserStats);
router.get("/:id", getUserById);
router.post("/", createUser);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);
router.patch("/:id/status", toggleUserStatus);
router.post("/:id/reset-password", resetUserPassword);
router.patch("/:id/vip", toggleVIPStatus);
router.get("/export", exportUsers);


export default router;
