import Favorites from "../models/favorites.model.js";
import { Vendor } from "../models/vendor.model.js";


export const getFavorites = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    const user = req.user._id;
    let query = { userId: user };

    if (search) {
      query.businessName = { $regex: search, $options: "i" };
    }

    const totalFavorites = await Favorites.countDocuments(query);
    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const favorites = await Favorites.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate({ path: 'vendorId', model: 'Vendor' });

    res.status(200).json({
      total: totalFavorites,
      page: parseInt(page),
      limit: parseInt(limit),
      favorites,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const addFavorite = async (req, res) => {
    try {
        const { vendorId } = req.body;
        const user = req.user;

        // Ensure the user is defined
        if (!user) {
            return res.status(400).json({ message: "User not authenticated" });
        }

        const vendor = await Vendor.findById(vendorId);
        if (!vendor) {
            return res.status(404).json({ message: "Vendor not found" });
        }

        const favorites = new Favorites({
            userId: user._id, // Use the user ID here
            vendorId,
            businessName: vendor.businessName, // Assuming vendor has a businessName field
        });

        await favorites.save();

        res.status(201).json({ message: "Vendor added to favorites", favorites });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
