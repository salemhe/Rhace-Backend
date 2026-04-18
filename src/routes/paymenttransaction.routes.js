import express from "express";
import {
  createPaymentTransaction,
  getPaymentTransactions,
  getEarnings,
  getTransactionHistory,
  createPayout,
  disputeTransaction,
  getPaymentTransactionById,
  markAsSettled,
} from "../controllers/paymenttransaction.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

// mergeParams: true allows us to access params from parent router (e.g., :bookingId)
const router = express.Router({ mergeParams: true });

router.use(protect());

// Routes for specific booking transactions
router.route("/")
  .post(authorize(["admin", "manager", "staff"]), createPaymentTransaction)
  .get(authorize(["admin", "manager", "staff"]), getPaymentTransactions);

router.get("/:id", authorize(["admin", "manager", "staff"]), getPaymentTransactionById); // New route

// General payment routes
router.get("/earnings", authorize(["admin", "manager"]), getEarnings);
router.get("/history", authorize(["admin", "manager"]), getTransactionHistory);
router.post("/payout", authorize(["admin", "manager"]), createPayout);
router.post("/:id/dispute", authorize(["admin", "manager"]), disputeTransaction);
router.patch("/:id/settle", authorize(["admin", "manager"]), markAsSettled); // New route

export default router;
