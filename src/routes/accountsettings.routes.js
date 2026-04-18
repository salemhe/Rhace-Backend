import express from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { getAccountSettings, updateAccountSettings } from "../controllers/accountsettings.controller.js";

const router = express.Router();

router.use(protect()); // All routes require authentication

router.route("/")
  .get(getAccountSettings)
  .put(updateAccountSettings);

export default router;
