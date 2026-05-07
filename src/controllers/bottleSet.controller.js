
import mongoose from "mongoose";
import BottleSet from "../models/bottleSet.model.js";
import Drink from "../models/drink.model.js";
import { recordAuditLog } from "../utils/auditLogger.js";

// @desc    Create a new bottle set
// @route   POST /api/bottle-sets
// @access  Private/Admin
export const createBottleSet = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { name, clubId, items = [], setPrice, newDrinks = [], discount, addOns, priceVisibility, image } = req.body;

    // Create new drinks if any
    if (newDrinks.length > 0) {
      for (const newDrink of newDrinks) {
        const drink = new Drink({ ...newDrink.drinkData, clubId });
        const savedDrink = await drink.save({ session });
        items.push({ drinkId: savedDrink._id, quantity: newDrink.quantity, order: newDrink.order });
      }
    }

    // Validate drinks
    if (items && items.length > 0) {
      for (const item of items) {
        const drink = await Drink.findById(item.drinkId).session(session);
        if (!drink) {
          throw new Error(`Drink with id ${item.drinkId} not found`);
        }
        if (drink.clubId.toString() !== clubId) {
          throw new Error(`Drink with id ${item.drinkId} does not belong to club ${clubId}`);
        }
        console.log(session, "Session")
      }
    }

    const bottleSet = new BottleSet({ name, clubId, items, setPrice, image, discount, addOns, priceVisibility });
    await bottleSet.save({ session });

    await recordAuditLog(req.user.id, "create", "BottleSet", bottleSet._id, { name, clubId, setPrice }, { session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json(bottleSet);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all bottle sets for a club
// @route   GET /api/bottle-sets
// @access  Private/Admin
export const getBottleSets = async (req, res) => {
  try {
    const { clubId, search, sortBy, sortOrder, page = 1, limit = 1000 } = req.query;
    const query = { clubId };

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const sortOptions = {};
    if (sortBy) {
      sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;
    }

    const bottleSets = await BottleSet.find(query)
      .populate("items.drinkId")
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await BottleSet.countDocuments(query);

    res.status(200).json({
      bottleSets,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get a single bottle set by ID
// @route   GET /api/bottle-sets/:id
// @access  Private/Admin
export const getBottleSetById = async (req, res) => {
  try {
    const { id } = req.params;
    const bottleSet = await BottleSet.findById(id).populate("items.drinkId");
    if (!bottleSet) {
      return res.status(404).json({ message: "Bottle set not found" });
    }
    res.status(200).json(bottleSet);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a bottle set
// @route   PUT /api/bottle-sets/:id
// @access  Private/Admin
export const updateBottleSet = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    const originalBottleSet = await BottleSet.findById(id);
    if (!originalBottleSet) {
      return res.status(404).json({ message: "Bottle set not found" });
    }

    // Validate drinks
    if (updateData.items && updateData.items.length > 0) {
      const clubId = updateData.clubId || originalBottleSet.clubId.toString();
      for (const item of updateData.items) {
        const drink = await Drink.findById(item.drinkId);
        if (!drink) {
          return res.status(400).json({ message: `Drink with name ${item.name} not found` });
        }
        if (drink.clubId.toString() !== clubId) {
          return res.status(400).json({ message: `Drink with name ${item.name} does not belong to club ${clubId}` });
        }
        if (drink.status !== 'Active') {
          return res.status(400).json({ message: `Drink with name ${item.name} is not active` });
        }
      }
    }

    if (req.files && req.files.length > 0) {
      updateData.images = req.files.map(file => file.path);
    }

    const updatedBottleSet = await BottleSet.findByIdAndUpdate(id, updateData, { new: true });

    await recordAuditLog(req.user.id, "update", "BottleSet", updatedBottleSet._id, { original: originalBottleSet.toObject(), updated: updatedBottleSet.toObject() });

    res.status(200).json(updatedBottleSet);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a bottle set
// @route   DELETE /api/bottle-sets/:id
// @access  Private/Admin
export const deleteBottleSet = async (req, res) => {
  try {
    const { id } = req.params;
    const bottleSet = await BottleSet.findByIdAndDelete(id);
    if (!bottleSet) {
      return res.status(404).json({ message: "Bottle set not found" });
    }

    await recordAuditLog(req.user.id, "delete", "BottleSet", bottleSet._id, { name: bottleSet.name });

    res.status(200).json({ message: "Bottle set removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
