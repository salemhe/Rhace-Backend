import express from "express";
import {
  createHotel,
  getHotels,
  getHotelById,
  updateHotel,
  deleteHotel,
  publishHotel,
  uploadHotelImagesController,
  getHotelReviewDetails, // Import the new controller function
} from "../controllers/hotel.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import { uploadHotelImages } from "../middlewares/hotelImage.middleware.js";

// Import nested routers
import roomtypeRoutes from "./roomtype.routes.js";
import hotelpolicyRoutes from "./hotelpolicy.routes.js";
import paymentsettingsRoutes from "./paymentsettings.routes.js";

const router = express.Router();

router.route("/")
  .post(protect, authorize(["admin", "vendor"]), uploadHotelImages, createHotel)
  .get(authorize(["admin", "vendor", "staff"]), getHotels);

router.route("/:id")
  .get(protect, authorize(["admin", "vendor", "staff"]), getHotelById)
  .put(protect, authorize(["admin", "vendor"]), updateHotel)
  .delete(protect, authorize(["admin"]), deleteHotel);

router.patch("/:id/publish", protect, authorize(["admin", "vendor"]), publishHotel);

// New route for uploading hotel images
router.patch(
  "/:id/upload-images",
  protect, 
  authorize(["admin", "vendor"]),
  uploadHotelImages,
  uploadHotelImagesController
);

// New route for getting hotel review details
router.get("/:id/review", protect, authorize(["admin", "vendor", "staff"]), getHotelReviewDetails);

// Nested routes for specific hotel ID
router.use("/:hotelId/roomtypes", roomtypeRoutes);
router.use("/:hotelId/policy", hotelpolicyRoutes);
router.use("/:hotelId/payment-settings", paymentsettingsRoutes);

export default router;
