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

router.use(protect); // All hotel routes require authentication

router.route("/")
  .post(authorize(["admin", "manager"]), uploadHotelImages, createHotel)
  .get(authorize(["admin", "manager", "staff"]), getHotels);

router.route("/:id")
  .get(authorize(["admin", "manager", "staff"]), getHotelById)
  .put(authorize(["admin", "manager"]), updateHotel)
  .delete(authorize(["admin"]), deleteHotel);

router.patch("/:id/publish", authorize(["admin", "manager"]), publishHotel);

// New route for uploading hotel images
router.patch(
  "/:id/upload-images",
  authorize(["admin", "manager"]),
  uploadHotelImages,
  uploadHotelImagesController
);

// New route for getting hotel review details
router.get("/:id/review", authorize(["admin", "manager", "staff"]), getHotelReviewDetails);

// Nested routes for specific hotel ID
router.use("/:hotelId/roomtypes", roomtypeRoutes);
router.use("/:hotelId/policy", hotelpolicyRoutes);
router.use("/:hotelId/payment-settings", paymentsettingsRoutes);

export default router;
