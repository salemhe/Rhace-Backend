import { Vendor, HotelVendor, RestaurantVendor, ClubVendor } from "../models/vendor.model.js";
import { Menu, MenuItem } from "../models/menu.model.js";
import BottleSet from "../models/bottleSet.model.js";
import Drink from "../models/drink.model.js";
import { filterVendorData } from "../utils/vendor.js";

const getModel = (type) => {
  if (!type) return Vendor;
  switch (type.toLowerCase()) {
    case "hotel":
    case "hotels":
      return HotelVendor;
    case "restaurant":
    case "restaurants":
      return RestaurantVendor;
    case "club":
    case "clubs":
      return ClubVendor;
    default:
      return Vendor;
  }
};

// Helper to split query into words for better matching
const splitQueryWords = (q) => {
  return q.toLowerCase().trim().split(/\s+/).filter(word => word.length > 1);
};

// Helper to check if query looks like time for clubs
const parseTimeQuery = (q, day) => {
  const timeMatch = q.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1]);
    const min = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const isPM = timeMatch[3].toLowerCase() === 'pm';
    let totalMin = (hour % 12) * 60 + min;
    if (isPM && hour !== 12) totalMin += 12 * 60;
    if (!isPM && hour === 12) totalMin = min;
    
    return {
      day,
      currentMinutes: totalMin,
      isTimeQuery: true
    };
  }
  return null;
};


const toInt = (val, fallback) => {
  const n = parseInt(val, 10);
  return isNaN(n) ? fallback : n;
};

const toFloat = (val, fallback) => {
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
};

// Comma-separated param → trimmed lowercase array
const toArr = (val) =>
  val ? val.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : [];

// "Open Now" helper — checks openingHours array on the vendor
const buildOpenNowFilter = () => {
  const now = new Date();
  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const day = days[now.getDay()];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return {
    openingHours: {
      $elemMatch: {
        day,
        isClosed: { $ne: true },
        $expr: {
          $and: [
            {
              $lte: [
                {
                  $add: [
                    { $multiply: [{ $toInt: { $substr: ["$open", 0, 2] } }, 60] },
                    { $toInt: { $substr: ["$open", 3, 2] } },
                  ],
                },
                currentMinutes,
              ],
            },
            {
              $gte: [
                {
                  $add: [
                    { $multiply: [{ $toInt: { $substr: ["$close", 0, 2] } }, 60] },
                    { $toInt: { $substr: ["$close", 3, 2] } },
                  ],
                },
                currentMinutes,
              ],
            },
          ],
        },
      },
    },
  };
};

// ─────────────────────────────────────────────────────────────────
// SELECT fields per vendor type — only fetch what the card needs
// ─────────────────────────────────────────────────────────────────
const BASE_SELECT =
  "businessName vendorType vendorTypeCategory address profileImages rating reviews priceRange isVerified acceptsOnlineBooking businessDescription specialCategory branch";

const TYPE_SELECT = {
  restaurant:
    "cuisines diningStyles dietaryOptions seatOptions occasionTags mealTimes reservationPolicy hasParking hasOutdoorSeating openingTime closingTime openingHours",
  hotel:
    "totalBooked offer policies starRating propertyType amenities mealPlan cancellationPolicy instantBook petFriendly payAtProperty accessibilityFeatures checkInTime checkOutTime openingHours",
  club:
    "venueType musicGenres livePerformanceTypes dressCode agePolicy entryFee bottleServiceMin hasVIPTables hasGuestlist hasOutdoorArea hasSmokingArea hasParking happyHour openingTime closingTime openingHours slots categories offer",
};

const buildSelect = (type) =>
  type && TYPE_SELECT[type.toLowerCase()]
    ? `${BASE_SELECT} ${TYPE_SELECT[type.toLowerCase()]}`
    : BASE_SELECT;

// ─────────────────────────────────────────────────────────────────
// 1. SUGGESTIONS
//    GET /api/search/suggestions?q=eko&type=hotel
// ─────────────────────────────────────────────────────────────────
export const getSearchSuggestions = async (req, res) => {
  try {
    const { q, type } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(200).json({ success: true, suggestions: [] });
    }

    const regex = new RegExp(q.trim(), "i");

    const filter = {
      isVerified: true,
      $or: [
        { businessName: regex },
        { vendorTypeCategory: regex },
        { address: regex },
      ],
    };

    if (type && ["hotel", "restaurant", "club"].includes(type.toLowerCase())) {
      filter.vendorType = type.toLowerCase();
    }

    const suggestions = await Vendor.find(filter)
      .select("businessName vendorType vendorTypeCategory address profileImages rating")
      .limit(8)
      .lean();

    return res.status(200).json({ success: true, suggestions });
  } catch (error) {
    console.error("[getSearchSuggestions]", error);
    return res.status(500).json({ success: false, message: "Suggestions failed" });
  }
};

// ─────────────────────────────────────────────────────────────────
// 2. MAIN SEARCH
//    GET /api/search?q=...&type=...&city=...
//    Shared filters: minRating, minPrice, maxPrice, sort, page, limit, latitude, longitude, openNow
//    Restaurant: cuisines, dietaryOptions, diningStyle, seatOptions, occasionTags, mealTimes, reservationPolicy, hasParking, hasOutdoorSeating
//    Hotel:      starRating, propertyType, amenities, mealPlan, cancellationPolicy, instantBook, petFriendly, accessibilityFeatures
//    Club:       venueType, musicGenres, livePerformanceTypes, dressCode, agePolicy, entryFee, hasVIPTables, hasGuestlist, hasOutdoorArea
// ─────────────────────────────────────────────────────────────────
export const search = async (req, res) => {
  try {
    const {
      q, type, city,
      minRating, minPrice, maxPrice,
      sort = "rating", page = 1, limit = 12,
      latitude, longitude, openNow,

      // Restaurant
      cuisines, dietaryOptions, diningStyle,
      seatOptions, occasionTags, mealTimes,
      reservationPolicy, hasParking, hasOutdoorSeating,

      // Hotel
      starRating, propertyType, amenities, mealPlan,
      cancellationPolicy, instantBook, petFriendly,
      accessibilityFeatures,

      // Club
      venueType, musicGenres, livePerformanceTypes,
      dressCode, agePolicy, entryFee,
      hasVIPTables, hasGuestlist, hasOutdoorArea,
    } = req.query;

    const pageNum  = Math.max(1, toInt(page, 1));
    const limitNum = Math.min(50, Math.max(1, toInt(limit, 12)));
    const skip     = (pageNum - 1) * limitNum;
    const model    = getModel(type);

    // ── Base filter ───────────────────────────────────────────────
    let match = { isVerified: true };

    if (q && q.trim()) {
      match.$text = { $search: q.trim() };
    }

    // Apply shared filters to pipelineMatch
    if (city && city.trim()) {
      pipelineMatch.address = { $regex: city.trim(), $options: "i" };
    }

    if (minRating) {
      pipelineMatch.rating = { $gte: toFloat(minRating, 0) };
    }

    if (minPrice || maxPrice) {
      pipelineMatch.priceRange = {};
      if (minPrice) pipelineMatch.priceRange.$gte = toInt(minPrice, 1);
      if (maxPrice) pipelineMatch.priceRange.$lte = toInt(maxPrice, 4);
    }

    if (latitude && longitude) {
      pipelineMatch.location = {
        $near: {
          $geometry: { type: "Point", coordinates: [toFloat(longitude), toFloat(latitude)] },
          $maxDistance: 10000,
        },
      };
    }

    if (openNow === "true") {
      Object.assign(pipelineMatch, buildOpenNowFilter());
    }

    // ── Restaurant-specific filters ───────────────────────────────
    const resolvedType = type?.toLowerCase();

    if (!resolvedType || resolvedType === "restaurant") {
      const cuisinesArr = toArr(cuisines);
      if (cuisinesArr.length) pipelineMatch.cuisines = { $in: cuisinesArr };

      const dietaryArr = toArr(dietaryOptions);
      if (dietaryArr.length) pipelineMatch.dietaryOptions = { $all: dietaryArr };

      if (diningStyle) pipelineMatch.diningStyles = diningStyle.toLowerCase();

      const seatArr = toArr(seatOptions);
      if (seatArr.length) pipelineMatch.seatOptions = { $in: seatArr };

      const occasionArr = toArr(occasionTags);
      if (occasionArr.length) pipelineMatch.occasionTags = { $in: occasionArr };

      const mealTimesArr = toArr(mealTimes);
      if (mealTimesArr.length) pipelineMatch.mealTimes = { $in: mealTimesArr };

      if (reservationPolicy) pipelineMatch.reservationPolicy = reservationPolicy.toLowerCase();
      if (hasParking === "true") pipelineMatch.hasParking = true;
      if (hasOutdoorSeating === "true") pipelineMatch.hasOutdoorSeating = true;
    }

    // ── Hotel-specific filters ────────────────────────────────────
    if (!resolvedType || resolvedType === "hotel") {
      if (starRating) filter.starRating = toInt(starRating, undefined);

      if (propertyType) filter.propertyType = propertyType.toLowerCase();

      const amenitiesArr = toArr(amenities);
      if (amenitiesArr.length) filter.amenities = { $all: amenitiesArr };

      if (mealPlan) filter.mealPlan = mealPlan.toLowerCase();
      if (cancellationPolicy) filter.cancellationPolicy = cancellationPolicy.toLowerCase();
      if (instantBook === "true") filter.instantBook = true;
      if (petFriendly === "true") filter.petFriendly = true;

      const accessibilityArr = toArr(accessibilityFeatures);
      if (accessibilityArr.length) filter.accessibilityFeatures = { $all: accessibilityArr };
    }

    // ── Club-specific filters ─────────────────────────────────────
    if (!resolvedType || resolvedType === "club") {
      if (venueType) filter.venueType = venueType.toLowerCase();

      const genresArr = toArr(musicGenres);
      if (genresArr.length) filter.musicGenres = { $in: genresArr };

      const performancesArr = toArr(livePerformanceTypes);
      if (performancesArr.length) filter.livePerformanceTypes = { $in: performancesArr };

      if (dressCode) filter.dressCode = dressCode.toLowerCase();
      if (agePolicy) filter.agePolicy = agePolicy;

      if (entryFee === "0") filter.entryFee = 0;
      else if (entryFee === "paid") filter.entryFee = { $gt: 0 };

      if (hasVIPTables === "true") filter.hasVIPTables = true;
      if (hasGuestlist === "true") filter.hasGuestlist = true;
      if (hasOutdoorArea === "true") filter.hasOutdoorArea = true;
    }

    // ── Sort ──────────────────────────────────────────────────────
    let sortObj = {};
    if (!latitude || !longitude) {
      switch (sort) {
        case "rating":     sortObj = { rating: -1, reviews: -1 }; break;
        case "price_asc":  sortObj = { priceRange: 1 };           break;
        case "price_desc": sortObj = { priceRange: -1 };          break;
        case "newest":     sortObj = { createdAt: -1 };           break;
        default:           sortObj = { rating: -1, reviews: -1 };
      }
    }

    // ── Aggregation pipeline with $text score + menu boost ──────
    const pipeline = [
      { $match: pipelineMatch },
      { $addFields: { textScore: { $meta: "textScore" } } },
      {
        $lookup: {
          from: "menuitems",
          localField: "_id",
          foreignField: "vendor",
          as: "menuItems"
        }
      },
      {
        $addFields: {
          menuMatchCount: {
            $size: {
              $filter: {
                input: "$menuItems",
                cond: { $regexMatch: { input: "$$this.name", regex: q ? new RegExp(q.trim(), "i") : /^$/ } }
              }
            }
          }
        }
      },
      {
        $addFields: {
          totalScore: { $add: [ "$textScore", { $multiply: [ "$menuMatchCount", 10 ] } ] }
        }
      },
      { $sort: { totalScore: -1, rating: -1, reviews: -1 } },
      { $skip: skip },
      { $limit: limitNum },
      { $project: buildSelect(resolvedType).split(" ").reduce((obj, field) => ({ ...obj, [field]: 1 }), {}) }
    ];

    const vendors = await model.aggregate(pipeline);

    const countPipeline = [
      { $match: pipelineMatch }
    ];
    const countResult = await model.aggregate([...countPipeline, { $count: "total" } ]);
    const totalCount = countResult[0]?.total || 0;

    const totalPages = Math.ceil(totalCount / limitNum);

    // ── Facets ────────────────────────────────────────────────────
    const facetMatch = {
      isVerified: true,
      isVisible: true,
      ...(q && filter.$or ? { $or: filter.$or } : {}),
    };

    const facets = await Vendor.aggregate([
      { $match: facetMatch },
      {
        $facet: {
          byType: [
            { $group: { _id: "$vendorType", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          byPriceRange: [
            { $group: { _id: "$priceRange", count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
          ratingBuckets: [
            {
              $bucket: {
                groupBy: "$rating",
                boundaries: [0, 3, 4, 4.5, 5.1],
                default: "unrated",
                output: { count: { $sum: 1 } },
              },
            },
          ],
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      data: vendors,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
      facets: facets[0] || {},
      meta: { q, type: resolvedType, sort, city },
    });
  } catch (error) {
    console.error("[search]", error);
    return res.status(500).json({ success: false, message: "Search failed" });
  }
};

// ─────────────────────────────────────────────────────────────────
// 3. TRENDING
//    GET /api/search/trending?type=restaurant
// ─────────────────────────────────────────────────────────────────
export const getTrending = async (req, res) => {
  try {
    const { type, limit = 6 } = req.query;

    const filter = { isVerified: true };
    if (type && ["hotel", "restaurant", "club"].includes(type.toLowerCase())) {
      filter.vendorType = type.toLowerCase();
    }

    const trending = await Vendor.find(filter)
      .select("businessName vendorType address profileImages rating reviews priceRange")
      .sort({ rating: -1, reviews: -1 })
      .limit(toInt(limit, 6))
      .lean();

    return res.status(200).json({ success: true, trending });
  } catch (error) {
    console.error("[getTrending]", error);
    return res.status(500).json({ success: false, message: "Failed to fetch trending" });
  }
};

// ─────────────────────────────────────────────────────────────────
// 4. DISCOVER (home page sections)
//    GET /api/search/discover?latitude=6.5&longitude=3.3
// ─────────────────────────────────────────────────────────────────
export const discover = async (req, res) => {
  try {
    const { latitude, longitude } = req.query;

    const baseFilter = { isVerified: true, isVisible: true };
    const selectFields =
      "businessName vendorType address profileImages rating reviews priceRange vendorTypeCategory isVerified";

    const nearbyFilter =
      latitude && longitude
        ? {
            ...baseFilter,
            location: {
              $near: {
                $geometry: { type: "Point", coordinates: [toFloat(longitude), toFloat(latitude)] },
                $maxDistance: 5000,
              },
            },
          }
        : baseFilter;

    const [nearby, topRated, hotels, restaurants, clubs] = await Promise.all([
      Vendor.find(nearbyFilter).select(selectFields).limit(6).lean(),
      Vendor.find(baseFilter).select(selectFields).sort({ rating: -1, reviews: -1 }).limit(6).lean(),
      HotelVendor.find(baseFilter).select(`${selectFields} starRating amenities mealPlan`).sort({ rating: -1 }).limit(6).lean(),
      RestaurantVendor.find(baseFilter).select(`${selectFields} cuisines diningStyles dietaryOptions`).sort({ rating: -1 }).limit(6).lean(),
      ClubVendor.find(baseFilter).select(`${selectFields} musicGenres venueType entryFee dressCode`).sort({ rating: -1 }).limit(6).lean(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        nearby: filterVendorData(nearby),
        topRated: filterVendorData(topRated),
        hotels: filterVendorData(hotels),
        restaurants: filterVendorData(restaurants),
        clubs: filterVendorData(clubs),
      },
    });
  } catch (error) {
    console.error("[discover]", error);
    return res.status(500).json({ success: false, message: "Discover failed" });
  }
};