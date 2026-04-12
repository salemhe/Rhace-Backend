/**
 * search.controller.js  (updated)
 *
 * Changes vs. original:
 *  1. discover() — now returns data keyed exactly as the frontend expects
 *     (nearby, topRated, restaurants, hotels, clubs) and passes location properly.
 *  2. getTrending() — now time-aware: night → clubs first, daytime → restaurants.
 *  3. search() — minor: also accepts `q` alias from frontend (already handled).
 *  4. getSearchSuggestions() — now also searches address sub-string for better
 *     "Lekki" / "VI" queries.
 *  5. Added getDiscoverByType() for future tab-click category discovery.
 */

import { Vendor, HotelVendor, RestaurantVendor, ClubVendor } from "../models/vendor.model.js";
import { filterVendorData } from "../utils/vendor.js";

const getModel = (type) => {
  if (!type) return Vendor;
  switch (type.toLowerCase()) {
    case "hotel": case "hotels": return HotelVendor;
    case "restaurant": case "restaurants": return RestaurantVendor;
    case "club": case "clubs": return ClubVendor;
    default: return Vendor;
  }
};

const toInt   = (val, fallback) => { const n = parseInt(val, 10);  return isNaN(n) ? fallback : n; };
const toFloat = (val, fallback) => { const n = parseFloat(val);     return isNaN(n) ? fallback : n; };
const toArr   = (val) => val ? val.split(",").map(s => s.trim().toLowerCase()).filter(Boolean) : [];

const buildOpenNowFilter = () => {
  const now  = new Date();
  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const day  = days[now.getDay()];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return {
    openingHours: {
      $elemMatch: {
        day,
        isClosed: { $ne: true },
        $expr: {
          $and: [
            { $lte: [{ $add: [{ $multiply: [{ $toInt: { $substr: ["$open", 0, 2] } }, 60] }, { $toInt: { $substr: ["$open", 3, 2] } }] }, currentMinutes] },
            { $gte: [{ $add: [{ $multiply: [{ $toInt: { $substr: ["$close", 0, 2] } }, 60] }, { $toInt: { $substr: ["$close", 3, 2] } }] }, currentMinutes] },
          ],
        },
      },
    },
  };
};

const BASE_SELECT = "businessName vendorType vendorTypeCategory address profileImages rating reviews priceRange isVerified acceptsOnlineBooking businessDescription specialCategory branch";
const TYPE_SELECT = {
  restaurant: "cuisines diningStyles dietaryOptions seatOptions occasionTags mealTimes reservationPolicy hasParking hasOutdoorSeating openingTime closingTime openingHours",
  hotel:      "totalBooked offer policies starRating propertyType amenities mealPlan cancellationPolicy instantBook petFriendly payAtProperty accessibilityFeatures checkInTime checkOutTime openingHours",
  club:       "venueType musicGenres livePerformanceTypes dressCode agePolicy entryFee bottleServiceMin hasVIPTables hasGuestlist hasOutdoorArea hasSmokingArea hasParking happyHour openingTime closingTime openingHours slots categories offer",
};
const buildSelect = (type) =>
  type && TYPE_SELECT[type.toLowerCase()] ? `${BASE_SELECT} ${TYPE_SELECT[type.toLowerCase()]}` : BASE_SELECT;

// ─── 1. SUGGESTIONS ────────────────────────────────────────────────────────────
export const getSearchSuggestions = async (req, res) => {
  try {
    const { q, type } = req.query;
    if (!q || q.trim().length < 2) return res.status(200).json({ success: true, suggestions: [] });

    const regex  = new RegExp(q.trim(), "i");
    const filter = {
      isVerified: true,
      $or: [
        { businessName: regex },
        { vendorTypeCategory: regex },
        { address: regex },
        { businessDescription: regex },
      ],
    };
    if (type && ["hotel","restaurant","club"].includes(type.toLowerCase())) {
      filter.vendorType = type.toLowerCase();
    }

    const suggestions = await Vendor.find(filter)
      .select("businessName vendorType vendorTypeCategory address profileImages rating")
      .limit(8).lean();

    return res.status(200).json({ success: true, suggestions });
  } catch (error) {
    console.error("[getSearchSuggestions]", error);
    return res.status(500).json({ success: false, message: "Suggestions failed" });
  }
};

// ─── 2. MAIN SEARCH ────────────────────────────────────────────────────────────
export const search = async (req, res) => {
  let model, match = {}, finalQ = "", pageNum = 1;
  try {
    const {
      q: queryQ, search: searchQ, type, city,
      minRating, minPrice, maxPrice,
      sort = "rating", page = 1, limit = 12,
      latitude, longitude, openNow,
      // Restaurant
      cuisines, dietaryOptions, diningStyle, seatOptions, occasionTags, mealTimes, reservationPolicy, hasParking, hasOutdoorSeating,
      // Hotel
      starRating, propertyType, amenities, mealPlan, cancellationPolicy, instantBook, petFriendly, accessibilityFeatures,
      // Club
      venueType, musicGenres, livePerformanceTypes, dressCode, agePolicy, entryFee, hasVIPTables, hasGuestlist, hasOutdoorArea,
    } = req.query;

    pageNum        = Math.max(1, toInt(page, 1));
    const limitNum = Math.min(50, Math.max(1, toInt(limit, 12)));
    const skip     = (pageNum - 1) * limitNum;
    model          = getModel(type);
    const resolvedType = type?.toLowerCase();

    match    = { isVerified: true };
    finalQ   = (queryQ || searchQ || "").trim();

    const fullMatch = { ...match };

    if (finalQ) {
      const regex = new RegExp(finalQ, "i");
      fullMatch.$or = [
        { businessName: regex },
        { vendorTypeCategory: regex },
        { address: regex },
        { businessDescription: regex },
      ];
    }

    if (city?.trim())  fullMatch.address  = { $regex: city.trim(), $options: "i" };
    if (minRating)     fullMatch.rating   = { $gte: toFloat(minRating, 0) };
    if (minPrice || maxPrice) {
      fullMatch.priceRange = {};
      if (minPrice) fullMatch.priceRange.$gte = toInt(minPrice, 1);
      if (maxPrice) fullMatch.priceRange.$lte = toInt(maxPrice, 4);
    }
    if (openNow === "true") Object.assign(fullMatch, buildOpenNowFilter());

    // Restaurant filters
    if (!resolvedType || resolvedType === "restaurant") {
      const cuisinesArr = toArr(cuisines);
      if (cuisinesArr.length) fullMatch.cuisines       = { $in: cuisinesArr };
      const dietaryArr  = toArr(dietaryOptions);
      if (dietaryArr.length)  fullMatch.dietaryOptions = { $all: dietaryArr };
      if (diningStyle)        fullMatch.diningStyles   = diningStyle.toLowerCase();
      const seatArr     = toArr(seatOptions);
      if (seatArr.length)     fullMatch.seatOptions    = { $in: seatArr };
      const occasionArr = toArr(occasionTags);
      if (occasionArr.length) fullMatch.occasionTags   = { $in: occasionArr };
      const mealTimesArr = toArr(mealTimes);
      if (mealTimesArr.length) fullMatch.mealTimes     = { $in: mealTimesArr };
      if (reservationPolicy)   fullMatch.reservationPolicy = reservationPolicy.toLowerCase();
      if (hasParking        === "true") fullMatch.hasParking        = true;
      if (hasOutdoorSeating === "true") fullMatch.hasOutdoorSeating = true;
    }

    // Hotel filters
    if (!resolvedType || resolvedType === "hotel") {
      if (starRating)    fullMatch.starRating        = toInt(starRating, undefined);
      if (propertyType)  fullMatch.propertyType      = propertyType.toLowerCase();
      const amenitiesArr = toArr(amenities);
      if (amenitiesArr.length) fullMatch.amenities   = { $all: amenitiesArr };
      if (mealPlan)             fullMatch.mealPlan   = mealPlan.toLowerCase();
      if (cancellationPolicy)   fullMatch.cancellationPolicy = cancellationPolicy.toLowerCase();
      if (instantBook   === "true") fullMatch.instantBook  = true;
      if (petFriendly   === "true") fullMatch.petFriendly  = true;
      const accessArr = toArr(accessibilityFeatures);
      if (accessArr.length) fullMatch.accessibilityFeatures = { $all: accessArr };
    }

    // Club filters
    if (!resolvedType || resolvedType === "club") {
      if (venueType) fullMatch.venueType = venueType.toLowerCase();
      const genresArr = toArr(musicGenres);
      if (genresArr.length) fullMatch.musicGenres = { $in: genresArr };
      const perfArr = toArr(livePerformanceTypes);
      if (perfArr.length) fullMatch.livePerformanceTypes = { $in: perfArr };
      if (dressCode) fullMatch.dressCode = dressCode.toLowerCase();
      if (agePolicy) fullMatch.agePolicy = agePolicy;
      if (entryFee === "0")    fullMatch.entryFee = 0;
      else if (entryFee === "paid") fullMatch.entryFee = { $gt: 0 };
      if (hasVIPTables   === "true") fullMatch.hasVIPTables   = true;
      if (hasGuestlist   === "true") fullMatch.hasGuestlist   = true;
      if (hasOutdoorArea === "true") fullMatch.hasOutdoorArea = true;
    }

    // Geo
    let geoNearStage;
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
          maxDistance: 15000,
        },
      };
      delete fullMatch.location;
    }

    // Sort
    let sortObj = {};
    if (!latitude || !longitude) {
      switch (sort) {
        case "rating":     sortObj = { rating: -1, reviews: -1 }; break;
        case "price_asc":  sortObj = { priceRange: 1 }; break;
        case "price_desc": sortObj = { priceRange: -1 }; break;
        case "newest":     sortObj = { createdAt: -1 }; break;
        default:           sortObj = { rating: -1, reviews: -1 };
      }
    }

    const regexPattern = finalQ ? new RegExp(finalQ, "i") : /^$/;

    const pipeline = [
      ...(geoNearStage ? [geoNearStage] : [{ $match: fullMatch }]),
      {
        $lookup: {
          from: "menuitems", localField: "_id", foreignField: "vendor", as: "menuItems",
        },
      },
      {
        $addFields: {
          menuMatchCount: {
            $size: {
              $filter: { input: "$menuItems", cond: { $regexMatch: { input: "$$this.name", regex: regexPattern } } },
            },
          },
        },
      },
      { $addFields: { totalScore: { $multiply: ["$menuMatchCount", 10] } } },
      { $sort: geoNearStage ? { distance: 1, totalScore: -1, rating: -1 } : { totalScore: -1, ...sortObj } },
      { $skip: skip },
      { $limit: limitNum },
      {
        $project: buildSelect(resolvedType).split(" ").reduce((obj, field) => ({ ...obj, [field]: 1 }), {}),
      },
    ];

    const [vendors, countResult] = await Promise.all([
      model.aggregate(pipeline),
      model.aggregate([{ $match: fullMatch }, { $count: "total" }]),
    ]);

    const totalCount = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / limitNum);

    // Facets
    const facetMatch = {
      isVerified: true,
      isVisible: true,
      ...(finalQ && fullMatch.$or ? { $or: fullMatch.$or } : {}),
    };
    const facets = await Vendor.aggregate([
      { $match: facetMatch },
      {
        $facet: {
          byType:      [{ $group: { _id: "$vendorType", count: { $sum: 1 } } }, { $sort: { count: -1 } }],
          byPriceRange:[{ $group: { _id: "$priceRange",  count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
          ratingBuckets:[{ $bucket: { groupBy: "$rating", boundaries: [0,3,4,4.5,5.1], default: "unrated", output: { count: { $sum: 1 } } } }],
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      data: vendors,
      pagination: { currentPage: pageNum, totalPages, totalCount, limit: limitNum, hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1 },
      facets: facets[0] || {},
      meta: { q: finalQ, type: resolvedType, sort, city },
    });
  } catch (error) {
    console.error("[search]", error.message);
    return res.status(500).json({ success: false, message: `Search failed: ${error.message}` });
  }
};

// ─── 3. TRENDING (time-aware) ─────────────────────────────────────────────────
export const getTrending = async (req, res) => {
  try {
    const { type, limit = 6 } = req.query;
    const hour = new Date().getHours();

    const filter = { isVerified: true };

    // If no type specified, bias by time of day
    if (!type) {
      // Night (9pm–4am) → clubs first; else restaurants
      if (hour >= 21 || hour < 4) filter.vendorType = "club";
      else if (hour >= 11 && hour < 16) filter.vendorType = "restaurant";
      // Morning → hotels
      else if (hour < 11) filter.vendorType = "hotel";
    } else if (["hotel","restaurant","club"].includes(type.toLowerCase())) {
      filter.vendorType = type.toLowerCase();
    }

    const trending = await Vendor.find(filter)
      .select("businessName vendorType address profileImages rating reviews priceRange vendorTypeCategory")
      .sort({ rating: -1, reviews: -1 })
      .limit(toInt(limit, 6))
      .lean();

    return res.status(200).json({ success: true, trending });
  } catch (error) {
    console.error("[getTrending]", error);
    return res.status(500).json({ success: false, message: "Failed to fetch trending" });
  }
};

// ─── 4. DISCOVER (home page discovery sections) ───────────────────────────────
export const discover = async (req, res) => {
  try {
    const { latitude, longitude } = req.query;
    const baseFilter = { isVerified: true, isVisible: true };
    const selectBase = "businessName vendorType address profileImages rating reviews priceRange vendorTypeCategory isVerified";

    // Build nearby filter — uses $near which doesn't require aggregation
    const hasCoords = latitude && longitude;
    const nearbyFilter = hasCoords
      ? {
          ...baseFilter,
          location: {
            $near: {
              $geometry: { type: "Point", coordinates: [toFloat(longitude), toFloat(latitude)] },
              $maxDistance: 8000,
            },
          },
        }
      : baseFilter;

    const [nearby, topRated, restaurants, hotels, clubs] = await Promise.all([
      Vendor.find(nearbyFilter)
        .select(selectBase)
        .limit(8).lean(),

      Vendor.find(baseFilter)
        .select(selectBase)
        .sort({ rating: -1, reviews: -1 })
        .limit(8).lean(),

      RestaurantVendor.find(baseFilter)
        .select(`${selectBase} cuisines diningStyles dietaryOptions`)
        .sort({ rating: -1, reviews: -1 })
        .limit(8).lean(),

      HotelVendor.find(baseFilter)
        .select(`${selectBase} starRating amenities mealPlan offer`)
        .sort({ rating: -1 })
        .limit(8).lean(),

      ClubVendor.find(baseFilter)
        .select(`${selectBase} musicGenres venueType entryFee dressCode`)
        .sort({ rating: -1 })
        .limit(8).lean(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        nearby:      filterVendorData(nearby),
        topRated:    filterVendorData(topRated),
        restaurants: filterVendorData(restaurants),
        hotels:      filterVendorData(hotels),
        clubs:       filterVendorData(clubs),
      },
    });
  } catch (error) {
    console.error("[discover]", error);
    return res.status(500).json({ success: false, message: "Discover failed" });
  }
};

// ─── 5. DISCOVER BY TYPE (when tab is clicked, no query) ──────────────────────
export const discoverByType = async (req, res) => {
  try {
    const { type }            = req.params;
    const { latitude, longitude } = req.query;
    const model      = getModel(type);
    const baseFilter = { isVerified: true, isVisible: true };
    const hasCoords  = latitude && longitude;

    const nearbyFilter = hasCoords
      ? { ...baseFilter, location: { $near: { $geometry: { type: "Point", coordinates: [toFloat(longitude), toFloat(latitude)] }, $maxDistance: 8000 } } }
      : baseFilter;

    const [nearby, topRated, newest] = await Promise.all([
      model.find(nearbyFilter).select(buildSelect(type)).limit(6).lean(),
      model.find(baseFilter).select(buildSelect(type)).sort({ rating: -1, reviews: -1 }).limit(6).lean(),
      model.find(baseFilter).select(buildSelect(type)).sort({ createdAt: -1 }).limit(6).lean(),
    ]);

    return res.status(200).json({
      success: true,
      type,
      data: {
        nearby:   filterVendorData(nearby),
        topRated: filterVendorData(topRated),
        newest:   filterVendorData(newest),
      },
    });
  } catch (error) {
    console.error("[discoverByType]", error);
    return res.status(500).json({ success: false, message: "Discover by type failed" });
  }
};