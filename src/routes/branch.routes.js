import express from "express";
import { createBranch, getBranches, updateBranch, deleteBranch, toggleBranchVisibility, exportBranchesCSV, loginBranch } from "../controllers/branch.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/login", loginBranch);
router.post("/", protect(), createBranch);
router.get("/", protect(), getBranches);
router.get("/export-csv", protect(), exportBranchesCSV); // New route for exporting branches
router.put("/:id", protect(), updateBranch);
router.delete("/:id", protect(), deleteBranch);
router.patch("/:id/toggle-visibility", protect(), toggleBranchVisibility);

export default router;
