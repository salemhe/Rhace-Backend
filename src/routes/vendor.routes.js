import express from "express";
import {protect} from "../middlewares/auth.middleware.js"
import { getOffers, getNearest, getTopRated, getVendorStats, deleteVendor, updateVendor, getVendor, getVendors } from "../controllers/vendor.controller.js";
import { confirmReservation, confirmByQRCode } from "../controllers/booking.controller.js";
import {
  createOrUpdatePaymentSettings,
  getPaymentSettings,
  deletePaymentSettings,
  createPaystackSubaccount
} from "../controllers/paymentsettings.controller.js";


const router = express.Router();


router.get("/offers", getOffers);

router.get("/nearest", getNearest)

router.get("/top-rated", getTopRated);

router.get("/", getVendors);


router.post("/bookings/:id/confirm", protect(), confirmReservation);
router.post("/bookings/confirm-by-qr", protect(), confirmByQRCode);
router.get("/stats", protect(), getVendorStats)
router.put("/:id", protect(), updateVendor)
router.delete("/:id", protect(), deleteVendor)
router.get("/:id", getVendor)

// Vendor proxy routes for reservation confirmation

// Payment settings routes
router.route("/:id/payment-settings")
  .post(protect(), createOrUpdatePaymentSettings)
  .get(protect(), getPaymentSettings)
  .delete(protect(), deletePaymentSettings);

router.post("/:id/payment-settings/subaccount", protect(), createPaystackSubaccount);

export default router;
