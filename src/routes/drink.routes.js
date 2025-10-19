
import express from "express";
import {
  createDrinkCategory,
  getDrinkCategories,
  updateDrinkCategory,
  deleteDrinkCategory,
  createDrink,
  getDrinks,
  getDrinkById,
  updateDrink,
  deleteDrink,
  addAddOnToDrink,
  createAddOn,
  getAddOns,
  updateAddOn,
  deleteAddOn,
} from "../controllers/drink.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

const router = express.Router();

router.use(protect);

// Drink Categories
router.route("/categories")
  .post(authorize(["admin", "vendor"]), createDrinkCategory)
  .get(authorize(["admin", "manager", "staff", "vendor"]), getDrinkCategories);

router.route("/categories/:id")
  .put(authorize(["admin", "vendor"]), updateDrinkCategory)
  .delete(authorize(["admin", "vendor"]), deleteDrinkCategory);

// Drinks
router.route("/")
  .post(authorize(["admin", "vendor", "staff"]), createDrink)
  .get(authorize(["admin", "manager", "staff", "vendor"]), getDrinks);

router.route("/:id")
  .get(authorize(["admin", "manager", "staff", "vendor"]), getDrinkById)
  .put(authorize(["admin", "vendor"]), updateDrink)
  .delete(authorize(["admin", "vendor"]), deleteDrink);

router.route("/:id/addons").post(authorize(["admin", "vendor"]), addAddOnToDrink);

// Add-ons
const addOnRouter = express.Router();
addOnRouter.use(protect);

addOnRouter.route("/")
  .post(authorize(["admin", "vendor"]), createAddOn)
  .get(authorize(["admin", "manager", "staff", "vendor"]), getAddOns);

addOnRouter.route("/:id")
  .put(authorize(["admin", "vendor"]), updateAddOn)
  .delete(authorize(["admin", "vendor"]), deleteAddOn);

export { router as drinkRoutes, addOnRouter };
