import {
  Vendor,
  HotelVendor,
  RestaurantVendor,
  ClubVendor,
} from "../models/vendor.model.js";

const selectFields = "_id businessName";

export const getVendorSuggestions = async (req, res) => {
  try {
    const { latitude, longitude } = req.query;

    console.log("Searching near:", latitude, longitude);
    const sample = await Vendor.findOne({}).select("location businessName");
    console.log("Sample vendor location:", sample.location);

    const nearbyQuery =
      latitude && longitude
        ? {
            isVisible: true,
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
        case "hotel":
          model = HotelVendor;
          break;
        case "restaurant":
          model = RestaurantVendor;
          break;
        case "club":
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
      filter.$or = [
        { businessName: { $regex: search, $options: "i" } },
        { cuisines: { $regex: search, $options: "i" } },
        { vendorTypeCategory: { $regex: search, $options: "i" } },
      ];
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

    res.status(200).json({
      success: true,
      count: vendors.length,
      data: vendors,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Unable to fetch vendors." });
  }
};
