
import express from "express";
import {
  createTable,
  getTables,
  getTableById,
  updateTable,
  deleteTable,
} from "../controllers/table.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

const router = express.Router();


router.get("/", getTables);
router.post("/", protect, authorize(["admin", "vendor", "staff"]), createTable);

router.route("/:id", protect)
  .get(authorize(["admin", "manager", "staff", "vendor"]), getTableById)
  .put(authorize(["admin", "vendor"]), updateTable)
  .delete(authorize(["admin", "vendor"]), deleteTable);


export default router;
