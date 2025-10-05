import express from "express";
import { getanks, verifyAccount } from "../controllers/payment.controller.js";

const router = express.Router();

router.get("/banks", getanks);
router.get('/verify-account', verifyAccount)

export default router;
