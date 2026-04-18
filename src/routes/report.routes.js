import express from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import {
  generateVendorEarningsReport,
  generateReservationsReport,
  generatePaymentsReport,
  generateUsersReport,
  generateVendorsReport,
  getReportJobStatus,
  downloadReport,
  listReports,
} from "../controllers/report.controller.js";

const router = express.Router();

router.use(protect());

// Report generation

// Route to generate a reservations report
router.post(
  "/reservations",
  authorize(["superadmin" , "admin"]),
  generateReservationsReport
);

// Route to generate a vendor earnings report
router.post(
  "/vendor-earnings",
  authorize(["superadmin" , "admin"]),
  generateVendorEarningsReport
);

// Route to generate a payments report
router.post("/payments", authorize(["superadmin" , "admin"]), generatePaymentsReport);

// Route to generate a users report
router.post("/users", authorize(["superadmin" , "admin"]), generateUsersReport);

// Route to generate a vendors report
router.post("/vendors", authorize(["superadmin"]), generateVendorsReport);

// Route to list all available reports
router.get("/", listReports);

// Route to check the status of a specific report
router.get("/:id/status", getReportJobStatus);

// Route to download a completed report
router.get("/:id/download", downloadReport);

export default router;