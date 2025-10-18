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
} from "../controllers/report.controller.js";

const router = express.Router();

router.use(protect);

// Report generation

// Route to generate a reservations report
router.post("/reservations", generateReservationsReport);

// Route to list all available reports
// router.get("/", listReports);

// // Route to check the status of a specific report
// router.get("/:id/status", getReportStatus);

// Route to download a completed report
router.get("/:id/download", downloadReport);

export default router;
