import {
  Vendor,
  HotelVendor,
  RestaurantVendor,
  ClubVendor,
} from "../models/vendor.model.js";
import {Menu, MenuItem} from "../models/menu.model.js";
import BottleSet from "../models/bottleSet.model.js";
import Drink from "../models/drink.model.js";
import { filterVendorData } from "../utils/vendor.js";

const selectFields = "_id businessName businessDescription";

export const getVendorSuggestions = async (req, res) => {
  try {
    const { latitude, longitude } = req.query;

    console.log("Searching near:", latitude, longitude);
    const sample = await Vendor.findOne({}).select("location businessName");
    console.log("Sample vendor location:", sample.location);

    const nearbyQuery =
      latitude && longitude
        ? {
            location: {
              $near: {
                $geometry: {
                  type: "Point",
                  coordinates: [parseFloat(longitude), parseFloat(latitude)],
                },
                $maxDistance: 5000,
              },
            },
          }
        : { isVisible: true };

    const [nearby, popular, topRated, trending, recentlyViewed] =
      await Promise.all([
        Vendor.find(nearbyQuery).limit(5).select(selectFields),
        Vendor.find().sort({ reviews: -1 }).limit(5).select(selectFields),
        Vendor.find().sort({ rating: -1 }).limit(5).select(selectFields),
        Vendor.find({ isVisible: true })
          .sort({ updatedAt: -1 })
          .limit(5)
          .select(selectFields),
        Vendor.find().sort({ createdAt: -1 }).limit(5).select(selectFields),
      ]);

    res.status(200).json({
      success: true,
      data: { nearby, popular, topRated, trending, recentlyViewed },
    });
  } catch (error) {
    console.error(error)
    res
      .status(500)
      .json({ success: false, message: "Unable to fetch vendor suggestions." });
  }
};

export const getVendors = async (req, res) => {
  try {
    const {
      type,
      search,
      latitude,
      longitude,
      page = 1,
      limit = 20,
    } = req.query;
    const skip = (page - 1) * limit;

    let model = Vendor;
    if (type) {
      switch (type.toLowerCase()) {
        case "hotels":
          model = HotelVendor;
          break;
        case "restaurants":
          model = RestaurantVendor;
          break;
        case "clubs":
          model = ClubVendor;
          break;
        default:
          return res
            .status(400)
            .json({ success: false, message: "Invalid vendor type." });
      }
    }

    const filter = {};

    if (search) {
      const regex = new RegExp(search, "i");

      // look up vendors that own matching menus / items / bottle sets / drinks
      const [
        menuVendorIds,
        menuItemVendorIds,
        bottleSetVendorIds,
        drinkVendorIds,
      ] = await Promise.all([
        Menu.find({ name: regex }).distinct("vendor").catch(() => []),
        MenuItem.find({ name: regex }).distinct("vendor").catch(() => []),
        BottleSet.find({ name: regex }).distinct("clubId").catch(() => []),
        Drink.find({ name: regex }).distinct("clubId").catch(() => []),
      ]);

      const relatedVendorIds = Array.from(
        new Set([
          ...menuVendorIds,
          ...menuItemVendorIds,
          ...bottleSetVendorIds,
          ...drinkVendorIds,
        ])
      ).filter(Boolean);

      // include vendor-id matches alongside the regular text fields
      const vendorIdClause = relatedVendorIds.length ? { _id: { $in: relatedVendorIds } } : null;

      // build the $or so vendors matching by name/cuisine/category OR owning a matching item are returned
      filter.$or = [
        { businessName: { $regex: search, $options: "i" } },
        { cuisines: { $regex: search, $options: "i" } },
        { vendorTypeCategory: { $regex: search, $options: "i" } },
        ...(vendorIdClause ? [vendorIdClause] : []),
      ]
    }

    if (latitude && longitude) {
      filter.location = {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          $maxDistance: 5000,
        },
      };
    }
    const vendors = await model
      .find(filter)
      .sort({ rating: -1, reviews: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const count = await model.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit),
      data: filterVendorData(vendors),
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Unable to fetch vendors." });
  }
};
