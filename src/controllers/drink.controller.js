
import Drink from "../models/drink.model.js";
import DrinkCategory from "../models/drinkCategory.model.js";
import AddOn from "../models/addOn.model.js";

// Drink Categories

// @desc    Create a new drink category
// @route   POST /api/drinks/categories
// @access  Private/Admin
export const createDrinkCategory = async (req, res) => {
  try {
    const drinkCategory = new DrinkCategory(req.body);
    await drinkCategory.save();
    res.status(201).json(drinkCategory);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all drink categories for a club
// @route   GET /api/drinks/categories
// @access  Private/Admin
export const getDrinkCategories = async (req, res) => {
  try {
    const { clubId } = req.query;
    const drinkCategories = await DrinkCategory.find({ clubId });
    res.status(200).json(drinkCategories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a drink category
// @route   PUT /api/drinks/categories/:id
// @access  Private/Admin
export const updateDrinkCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const drinkCategory = await DrinkCategory.findByIdAndUpdate(id, req.body, { new: true });
    if (!drinkCategory) {
      return res.status(404).json({ message: "Drink category not found" });
    }
    res.status(200).json(drinkCategory);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a drink category
// @route   DELETE /api/drinks/categories/:id
// @access  Private/Admin
export const deleteDrinkCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const drinkCategory = await DrinkCategory.findByIdAndDelete(id);
    if (!drinkCategory) {
      return res.status(404).json({ message: "Drink category not found" });
    }
    res.status(200).json({ message: "Drink category removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Drinks

// @desc    Create a new drink
// @route   POST /api/drinks
// @access  Private/Admin
export const createDrink = async (req, res) => {
  try {
    const drink = new Drink(req.body);
    await drink.save();
    res.status(201).json(drink);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all drinks for a club
// @route   GET /api/drinks
// @access  Private/Admin
export const getDrinks = async (req, res) => {
  try {
    const { clubId, category, status, search, page = 1, limit = 10, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    let query = { clubId };

    if (category) {
      query.category = category;
    }

    if (status) {
      query.status = status;
    }

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const totalDrinks = await Drink.countDocuments(query);

    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const drinks = await Drink.find(query)
      .populate("category")
      .populate("addOns")
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.status(200).json({
      total: totalDrinks,
      page: parseInt(page),
      limit: parseInt(limit),
      drinks,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get a single drink by ID
// @route   GET /api/drinks/:id
// @access  Private/Admin
export const getDrinkById = async (req, res) => {
  try {
    const { id } = req.params;
    const drink = await Drink.findById(id).populate("category").populate("addOns");
    if (!drink) {
      return res.status(404).json({ message: "Drink not found" });
    }
    res.status(200).json(drink);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a drink
// @route   PUT /api/drinks/:id
// @access  Private/Admin
export const updateDrink = async (req, res) => {
  try {
    const { id } = req.params;
    const drink = await Drink.findByIdAndUpdate(id, req.body, { new: true });
    if (!drink) {
      return res.status(404).json({ message: "Drink not found" });
    }
    res.status(200).json(drink);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a drink
// @route   DELETE /api/drinks/:id
// @access  Private/Admin
export const deleteDrink = async (req, res) => {
  try {
    const { id } = req.params;
    const drink = await Drink.findByIdAndDelete(id);
    if (!drink) {
      return res.status(404).json({ message: "Drink not found" });
    }
    res.status(200).json({ message: "Drink removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add an add-on to a drink
// @route   POST /api/drinks/:id/addons
// @access  Private/Admin
export const addAddOnToDrink = async (req, res) => {
  try {
    const { id } = req.params;
    const { addOnId } = req.body;

    const drink = await Drink.findById(id);
    if (!drink) {
      return res.status(404).json({ message: "Drink not found" });
    }

    const addOn = await AddOn.findById(addOnId);
    if (!addOn) {
      return res.status(404).json({ message: "Add-on not found" });
    }

    if (drink.addOns.includes(addOnId)) {
      return res.status(400).json({ message: "Add-on already exists for this drink" });
    }

    drink.addOns.push(addOnId);
    await drink.save();

    res.status(200).json(drink);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Add-ons

// @desc    Create a new add-on
// @route   POST /api/addons
// @access  Private/Admin
export const createAddOn = async (req, res) => {
  try {
    const addOn = new AddOn(req.body);
    await addOn.save();
    res.status(201).json(addOn);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all add-ons for a club
// @route   GET /api/addons
// @access  Private/Admin
export const getAddOns = async (req, res) => {
  try {
    const { clubId } = req.query;
    const addOns = await AddOn.find({ clubId });
    res.status(200).json(addOns);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update an add-on
// @route   PUT /api/addons/:id
// @access  Private/Admin
export const updateAddOn = async (req, res) => {
  try {
    const { id } = req.params;
    const addOn = await AddOn.findByIdAndUpdate(id, req.body, { new: true });
    if (!addOn) {
      return res.status(404).json({ message: "Add-on not found" });
    }
    res.status(200).json(addOn);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete an add-on
// @route   DELETE /api/addons/:id
// @access  Private/Admin
export const deleteAddOn = async (req, res) => {
  try {
    const { id } = req.params;
    const addOn = await AddOn.findByIdAndDelete(id);
    if (!addOn) {
      return res.status(404).json({ message: "Add-on not found" });
    }
    res.status(200).json({ message: "Add-on removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
