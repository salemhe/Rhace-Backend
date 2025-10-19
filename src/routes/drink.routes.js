
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
  .post(authorize(["admin"]), createDrinkCategory)
  .get(authorize(["admin", "manager", "staff"]), getDrinkCategories);

router.route("/categories/:id")
  .put(authorize(["admin"]), updateDrinkCategory)
  .delete(authorize(["admin"]), deleteDrinkCategory);

// Drinks
router.route("/")
  .post(authorize(["admin", "vendor"]), createDrink)
  .get(authorize(["admin", "manager", "staff"]), getDrinks);

router.route("/:id")
  .get(authorize(["admin", "manager", "staff"]), getDrinkById)
  .put(authorize(["admin"]), updateDrink)
  .delete(authorize(["admin"]), deleteDrink);

router.route("/:id/addons").post(authorize(["admin"]), addAddOnToDrink);

// Add-ons
const addOnRouter = express.Router();
addOnRouter.use(protect);

addOnRouter.route("/")
  .post(authorize(["admin"]), createAddOn)
  .get(authorize(["admin", "manager", "staff"]), getAddOns);

addOnRouter.route("/:id")
  .put(authorize(["admin"]), updateAddOn)
  .delete(authorize(["admin"]), deleteAddOn);

export { router as drinkRoutes, addOnRouter };
