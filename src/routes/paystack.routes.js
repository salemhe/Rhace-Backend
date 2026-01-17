import express from "express";
import { handlePaystack } from "../controllers/paystack.controller.js";

const router = express.Router();

router.post("/", express.raw({ type: "application/json" }), handlePaystack);

export default router;