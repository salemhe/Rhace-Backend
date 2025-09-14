import Amenity from "../models/amenity.model.js";

// @desc    Create a new amenity
// @route   POST /api/amenities
// @access  Private
export const createAmenity = async (req, res) => {
  try {
    const amenity = new Amenity(req.body);
    await amenity.save();
    res.status(201).json(amenity);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all amenities
// @route   GET /api/amenities
// @access  Private
export const getAmenities = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    let query = {};

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const totalAmenities = await Amenity.countDocuments(query);
    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const amenities = await Amenity.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.status(200).json({
      total: totalAmenities,
      page: parseInt(page),
      limit: parseInt(limit),
      amenities,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
