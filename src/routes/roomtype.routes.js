import express from "express";
import {
  createRoomType,
  getRoomTypes,
  getRoomTypeById,
  updateRoomType,
  deleteRoomType,
  uploadRoomTypeImagesController,
  deleteRoomTypeImage, // Import the new controller function
} from "../controllers/roomtype.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import { uploadRoomTypeImages } from "../middlewares/roomTypeImage.middleware.js"; // Import the upload middleware

// mergeParams: true allows us to access params from parent router (e.g., :hotelId)
const router = express.Router({ mergeParams: true });

router.use(protect);

router.route("/")
  .post(authorize(["admin", "manager"]), createRoomType)
  .get(authorize(["admin", "manager", "staff"]), getRoomTypes);

router.route("/:id")
  .get(authorize(["admin", "manager", "staff"]), getRoomTypeById)
  .put(authorize(["admin", "manager"]), updateRoomType)
  .delete(authorize(["admin", "manager"]), deleteRoomType);

// New route for uploading room type images
router.patch(
  "/:id/upload-images",
  authorize(["admin", "manager"]),
  uploadRoomTypeImages, // Multer middleware to handle file upload
  uploadRoomTypeImagesController // Controller to handle logic after upload
);

export default router;
