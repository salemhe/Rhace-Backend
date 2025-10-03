import express from "express";
import {
  createBooking,
  getBookings,
  getBookingById,
  updateBooking,
  cancelBooking,
  markAsNoShow,
  getBookingCounts,
  refundBooking,
  exportBookings,
  bulkUpdateBookings,
  addBookingNote,
  generateBookingReceipt,
  getMyBookings,
} from "../controllers/booking.controller.js";

router.route("/my-bookings").get(getMyBookings);import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import paymentTransactionRouter from "./paymenttransaction.routes.js";

const router = express.Router();

router.use(protect);

router.route("/")
  .get(authorize(["admin", "manager", "staff"]), getBookings)
  .post(authorize(["admin", "manager", "staff"]), createBooking);

router.route("/:id")
  .get(authorize(["admin", "manager", "staff"]), getBookingById)
  .put(authorize(["admin", "manager", "staff"]), updateBooking);

router.get("/counts", authorize(["admin", "manager", "staff"]), getBookingCounts);

router.put("/:id/cancel", authorize(["admin", "manager", "staff"]), cancelBooking);
router.put("/:id/no-show", authorize(["admin", "manager", "staff"]), markAsNoShow);
router.post("/:id/refund", authorize(["admin", "manager"]), refundBooking);

router.get("/export", authorize(["admin", "manager", "staff"]), exportBookings); // Route for export
router.patch("/:id/note", authorize(["admin", "manager", "staff"]), addBookingNote); // Route for adding note

router.put("/bulk-update", authorize(["admin", "manager"]), bulkUpdateBookings);

router.get("/:id/receipt", authorize(["admin", "manager", "staff"]), generateBookingReceipt);

// Re-route into other resource routers
router.use("/:bookingId/transactions", paymentTransactionRouter);

export default router;