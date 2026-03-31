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
  let model;
  let match = {};
  let finalQ = '';

  try {
    const {
      q: queryQ, search, type, city,
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
    model = getModel(type);

    // ── Base filter ───────────────────────────────────────────────
    match = { isVerified: true };
    
    finalQ = (queryQ || search || '').trim();
    if (finalQ) {
      try {
        // Try text search first (faster, ranked)
        match.$text = { $search: finalQ };
      } catch (textError) {
        console.warn("[search] Text index unavailable, falling back to regex:", textError.message);
        // Fallback: regex on key fields
        const regex = new RegExp(finalQ, 'i');
        match.$or = [
          { businessName: regex },
          { vendorTypeCategory: regex },
          { address: { $regex: regex } },
          { businessDescription: { $regex: regex } }
        ];
      }
    }
    console.log("[search] Query:", finalQ, "Model:", model.modelName, "Match:", JSON.stringify(match).slice(0, 200) + '...');

    // Pre-compute regex for pipeline (MongoDB can't access JS vars)
    const regexPattern = finalQ ? new RegExp(finalQ, 'i') : /^$/;

    // Build complete match filter (was pipelineMatch - rename to match for consistency)
    const fullMatch = { ...match };

    // Apply shared filters
    if (city && city.trim()) {
      fullMatch.address = { $regex: city.trim(), $options: "i" };
    }

    if (minRating) {
      fullMatch.rating = { $gte: toFloat(minRating, 0) };
    }

    if (minPrice || maxPrice) {
      fullMatch.priceRange = {};
      if (minPrice) fullMatch.priceRange.$gte = toInt(minPrice, 1);
      if (maxPrice) fullMatch.priceRange.$lte = toInt(maxPrice, 4);
    }

    let geoNearStage;

    if (openNow === "true") {
      Object.assign(fullMatch, buildOpenNowFilter());
    }

    // ── Restaurant-specific filters ───────────────────────────────
    const resolvedType = type?.toLowerCase();

    if (!resolvedType || resolvedType === "restaurant") {
      const cuisinesArr = toArr(cuisines);
      if (cuisinesArr.length) fullMatch.cuisines = { $in: cuisinesArr };

      const dietaryArr = toArr(dietaryOptions);
      if (dietaryArr.length) fullMatch.dietaryOptions = { $all: dietaryArr };

      if (diningStyle) fullMatch.diningStyles = diningStyle.toLowerCase();

      const seatArr = toArr(seatOptions);
      if (seatArr.length) fullMatch.seatOptions = { $in: seatArr };

      const occasionArr = toArr(occasionTags);
      if (occasionArr.length) fullMatch.occasionTags = { $in: occasionArr };

      const mealTimesArr = toArr(mealTimes);
      if (mealTimesArr.length) fullMatch.mealTimes = { $in: mealTimesArr };

      if (reservationPolicy) fullMatch.reservationPolicy = reservationPolicy.toLowerCase();
      if (hasParking === "true") fullMatch.hasParking = true;
      if (hasOutdoorSeating === "true") fullMatch.hasOutdoorSeating = true;
    }

    // ── Hotel-specific filters ────────────────────────────────────
    if (!resolvedType || resolvedType === "hotel") {
      if (starRating) fullMatch.starRating = toInt(starRating, undefined);

      if (propertyType) fullMatch.propertyType = propertyType.toLowerCase();

      const amenitiesArr = toArr(amenities);
      if (amenitiesArr.length) fullMatch.amenities = { $all: amenitiesArr };

      if (mealPlan) fullMatch.mealPlan = mealPlan.toLowerCase();
      if (cancellationPolicy) fullMatch.cancellationPolicy = cancellationPolicy.toLowerCase();
      if (instantBook === "true") fullMatch.instantBook = true;
      if (petFriendly === "true") fullMatch.petFriendly = true;

      const accessibilityArr = toArr(accessibilityFeatures);
      if (accessibilityArr.length) fullMatch.accessibilityFeatures = { $all: accessibilityArr };
    }

    // ── Club-specific filters ─────────────────────────────────────
    if (!resolvedType || resolvedType === "club") {
      if (venueType) fullMatch.venueType = venueType.toLowerCase();

      const genresArr = toArr(musicGenres);
      if (genresArr.length) fullMatch.musicGenres = { $in: genresArr };

      const performancesArr = toArr(livePerformanceTypes);
      if (performancesArr.length) fullMatch.livePerformanceTypes = { $in: performancesArr };

      if (dressCode) fullMatch.dressCode = dressCode.toLowerCase();
      if (agePolicy) fullMatch.agePolicy = agePolicy;

      if (entryFee === "0") fullMatch.entryFee = 0;
      else if (entryFee === "paid") fullMatch.entryFee = { $gt: 0 };

      if (hasVIPTables === "true") fullMatch.hasVIPTables = true;
      if (hasGuestlist === "true") fullMatch.hasGuestlist = true;
      if (hasOutdoorArea === "true") fullMatch.hasOutdoorArea = true;
    }

    if (latitude && longitude) {
      const coords = [toFloat(longitude), toFloat(latitude)];
      const geoQuery = { ...fullMatch };
      delete geoQuery.location;
      geoNearStage = {
        $geoNear: {
          near: { type: "Point", coordinates: coords },
          distanceField: "distance",
          spherical: true,
          query: geoQuery,
          key: "location",
          maxDistance: 10000,
        },
      };
      delete fullMatch.location;
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
      ...(geoNearStage ? [geoNearStage] : [{ $match: fullMatch }]),
      // Only add textScore if we used $text search
      ...(match.$text ? [{ $addFields: { textScore: { $meta: "textScore" } } }] : []),
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
                cond: { $regexMatch: { input: "$$this.name", regex: regexPattern } }

              }
            }
          }
        }
      },
      {
        $addFields: {
          totalScore: { $add: [ { $ifNull: ["$textScore", 0] }, { $multiply: [ "$menuMatchCount", 10 ] } ] }
        }
      },
      { $sort: { totalScore: -1, rating: -1, reviews: -1 } },
      { $skip: skip },
      { $limit: limitNum },
      { $project: buildSelect(resolvedType).split(" ").reduce((obj, field) => ({ ...obj, [field]: 1 }), {}) }
    ];

    const vendors = await model.aggregate(pipeline);

    const countPipeline = [
      { $match: fullMatch }
    ];
    const countResult = await model.aggregate([...countPipeline, { $count: "total" } ]);
    const totalCount = countResult[0]?.total || 0;

    const totalPages = Math.ceil(totalCount / limitNum);

    // ── Facets ────────────────────────────────────────────────────
    const facetMatch = {
      isVerified: true,
      isVisible: true,
      ...(finalQ && fullMatch.$or ? { $or: fullMatch.$or } : {}),
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
      meta: { q: finalQ, type: resolvedType, sort, city },
    });
  } catch (error) {
    console.error("[search] FULL ERROR:", {
      message: error.message,
      stack: error.stack,
      query: finalQ,
      model: model?.modelName || null,
      match
    });
    
    // Graceful degradation - return empty results instead of 500
    if (error.message.includes('text index') || error.message.includes('$text')) {
      console.warn("[search] Text search failed, consider creating text index on vendors collection");
      return res.status(200).json({
        success: true, 
        data: [],
        pagination: { currentPage: pageNum, totalPages: 0, totalCount: 0, limit: limitNum },
        facets: {},
        meta: { warning: "Text index missing - using regex fallback recommended" }
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      message: `Search failed: ${error.message}`,
      ...(process.env.NODE_ENV === 'development' && { error: error.message, stack: error.stack })
    });
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

