/**
 * search.controller.js
 *
 * Key changes:
 *  1. Uses MongoDB $text search (weighted index) for main vendor query
 *  2. Suggestions support cuisine/genre/amenity filters
 *  3. Minimal filter application — only active params touch the query
 *  4. Fixed $lookup collection names and foreign keys (from previous fix)
 *  5. Sub-collection scoring preserved
 */

import mongoose from "mongoose";
import PopularSearch from "../models/popularSearch.model.js";
import { Vendor, HotelVendor, RestaurantVendor, ClubVendor } from "../models/vendor.model.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getModel = (type) => {
  if (!type) return Vendor;
  switch (type.toLowerCase()) {
    case "hotel":      case "hotels":      return HotelVendor;
    case "restaurant": case "restaurants": return RestaurantVendor;
    case "club":       case "clubs":       return ClubVendor;
    default: return Vendor;
  }
};

const toInt   = (val, fallback) => { const n = parseInt(val, 10); return isNaN(n) ? fallback : n; };
const toFloat = (val, fallback) => { const n = parseFloat(val);   return isNaN(n) ? fallback : n; };

/** Split a comma-separated string → trimmed lowercase array, empty filtered */
const toArr = (val) =>
  val ? val.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : [];

/** Only assign a filter key when the value is non-empty — avoids $in:[] wiping results */
const setIf    = (obj, key, arr, op = "$in")  => { if (arr.length)    obj[key] = { [op]: arr }; };
const setIfVal = (obj, key, val)               => { if (val != null)   obj[key] = val; };
const setIfStr = (obj, key, val)               => { if (val?.trim())   obj[key] = val.trim().toLowerCase(); };
const setIfBool= (obj, key, val)               => { if (val === "true") obj[key] = true; };

const buildOpenNowFilter = () => {
  const now  = new Date();
  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const day  = days[now.getDay()];
  const cur  = now.getHours() * 60 + now.getMinutes();
  return {
    openingHours: {
      $elemMatch: {
        day,
        isClosed: { $ne: true },
        $expr: {
          $and: [
            { $lte: [{ $add: [{ $multiply: [{ $toInt: { $substr: ["$open",  0, 2] } }, 60] }, { $toInt: { $substr: ["$open",  3, 2] } }] }, cur] },
            { $gte: [{ $add: [{ $multiply: [{ $toInt: { $substr: ["$close", 0, 2] } }, 60] }, { $toInt: { $substr: ["$close", 3, 2] } }] }, cur] },
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
  type && TYPE_SELECT[type.toLowerCase()]
    ? `${BASE_SELECT} ${TYPE_SELECT[type.toLowerCase()]}`
    : BASE_SELECT;

/**
 * Build the shared filter object from all query params.
 * Only keys with actual values are added — minimal footprint.
 */
const buildFilter = (params, base = {}) => {
  const {
    type, city, minRating, minPrice, maxPrice, openNow,
    // Restaurant
    cuisines, dietaryOptions, diningStyle, seatOptions,
    occasionTags, mealTimes, reservationPolicy, hasParking, hasOutdoorSeating,
    // Hotel
    starRating, propertyType, amenities, mealPlan, cancellationPolicy,
    instantBook, petFriendly, accessibilityFeatures,
    // Club
    venueType, musicGenres, livePerformanceTypes, dressCode, agePolicy,
    entryFee, hasVIPTables, hasGuestlist, hasOutdoorArea,
  } = params;

  const f = { ...base };
  const resolvedType = type?.toLowerCase();

  if (city?.trim()) f.address = { $regex: city.trim(), $options: "i" };

  if (minRating) {
    f.rating = { $gte: toFloat(minRating, 0) };
  }
  if (minPrice || maxPrice) {
    f.priceRange = {};
    if (minPrice) f.priceRange.$gte = toInt(minPrice, 1);
    if (maxPrice) f.priceRange.$lte = toInt(maxPrice, 4);
  }
  if (openNow === "true") Object.assign(f, buildOpenNowFilter());

  // ── Restaurant ─────────────────────────────────────────────────────────────
  if (!resolvedType || resolvedType === "restaurant") {
    setIf(f, "cuisines",          toArr(cuisines));
    setIf(f, "dietaryOptions",    toArr(dietaryOptions), "$all"); // must match ALL selected dietary tags
    setIf(f, "seatOptions",       toArr(seatOptions));
    setIf(f, "occasionTags",      toArr(occasionTags));
    setIf(f, "mealTimes",         toArr(mealTimes));
    setIfStr(f,  "diningStyles",       diningStyle);
    setIfStr(f,  "reservationPolicy",  reservationPolicy);
    setIfBool(f, "hasParking",         hasParking);
    setIfBool(f, "hasOutdoorSeating",  hasOutdoorSeating);
  }

  // ── Hotel ──────────────────────────────────────────────────────────────────
  if (!resolvedType || resolvedType === "hotel") {
    if (starRating) f.starRating = toInt(starRating, undefined);
    setIfStr(f,  "propertyType",         propertyType);
    setIf(f,     "amenities",            toArr(amenities), "$all"); // must have ALL selected amenities
    setIfStr(f,  "mealPlan",             mealPlan);
    setIfStr(f,  "cancellationPolicy",   cancellationPolicy);
    setIfBool(f, "instantBook",          instantBook);
    setIfBool(f, "petFriendly",          petFriendly);
    setIf(f,     "accessibilityFeatures", toArr(accessibilityFeatures), "$all");
  }

  // ── Club ───────────────────────────────────────────────────────────────────
  if (!resolvedType || resolvedType === "club") {
    setIfStr(f, "venueType",  venueType);
    setIf(f, "musicGenres",          toArr(musicGenres));
    setIf(f, "livePerformanceTypes", toArr(livePerformanceTypes));
    setIfStr(f, "dressCode",  dressCode);
    setIfVal(f, "agePolicy",  agePolicy || null);
    if (entryFee === "0")      f.entryFee = 0;
    else if (entryFee === "paid") f.entryFee = { $gt: 0 };
    setIfBool(f, "hasVIPTables",   hasVIPTables);
    setIfBool(f, "hasGuestlist",   hasGuestlist);
    setIfBool(f, "hasOutdoorArea", hasOutdoorArea);
  }

  return f;
};


// ─── 1. SUGGESTIONS ────────────────────────────────────────────────────────────
export const getSearchSuggestions = async (req, res) => {
  try {
    const { q, type, cuisines, musicGenres, amenities } = req.query;
    if (!q || q.trim().length < 2) return res.status(200).json({ success: true, suggestions: [] });

    const typeLower  = type?.toLowerCase();
    const typeFilter = typeLower && ["hotel","restaurant","club"].includes(typeLower) ? { vendorType: typeLower } : {};

    // Prefer $text search (uses weighted index: businessName×10, category×5 …)
    // Fall back to $regex for address (not in text index)
    const textFilter = {
      isVerified  : true,
      isOnboarded : true,
      ...typeFilter,
      $text: { $search: q.trim() },
    };

    // Apply any active attribute filters to suggestions as well
    const attrFilter = buildFilter(
      { type, cuisines, musicGenres, amenities },
      { isVerified: true, isOnboarded: true, ...typeFilter }
    );

    // Also capture address partial matches that $text won't hit
    const addressFilter = {
      isVerified  : true,
      isOnboarded : true,
      ...typeFilter,
      ...attrFilter,
      address: { $regex: q.trim(), $options: "i" },
    };

    // ── Sub-collection matches ────────────────────────────────────────────────
    const regex = new RegExp(q.trim(), "i");

    const [menuItemIds, drinkIds, roomIds, tableIds] = await Promise.all([
      (!typeLower || typeLower === "restaurant")
        ? mongoose.model("MenuItem")
            .find({ $or: [{ name: regex }, { description: regex }, { category: regex }] }, "vendor")
            .lean().then((r) => r.map((d) => d.vendor))
        : [],

      (!typeLower || typeLower === "club")
        ? mongoose.model("Drink")
            .find({ $or: [{ name: regex }, { category: regex }] }, "clubId")
            .lean().then((r) => r.map((d) => d.clubId))
        : [],

      (!typeLower || typeLower === "hotel")
        ? mongoose.model("RoomType")
            .find({ $or: [{ name: regex }, { description: regex }, { roomCategory: regex }] }, "hotelId")
            .lean().then((r) => r.map((d) => d.hotelId))
        : [],

      (!typeLower || typeLower === "club")
        ? mongoose.model("Table")
            .find({ $or: [{ name: regex }, { description: regex }, { category: regex }] }, "clubId")
            .lean().then((r) => r.map((d) => d.clubId))
        : [],
    ]);

    const subIds = [...menuItemIds, ...drinkIds, ...roomIds, ...tableIds];

    // ── Combined query (text match OR address OR sub-collection vendor) ───────
    const combinedFilter = {
      isVerified  : true,
      isOnboarded : true,
      ...typeFilter,
      // Spread any attribute filters (cuisines, musicGenres etc.)
      ...Object.fromEntries(
        Object.entries(attrFilter).filter(([k]) =>
          !["isVerified","isOnboarded","vendorType"].includes(k)
        )
      ),
      $or: [
        { $text: { $search: q.trim() } },
        { address: { $regex: q.trim(), $options: "i" } },
        ...(subIds.length ? [{ _id: { $in: subIds } }] : []),
      ],
    };

    const suggestions = await Vendor.find(combinedFilter)
      .select("businessName vendorType vendorTypeCategory address profileImages rating score cuisines musicGenres amenities")
      // $text gives us a textScore we can sort by
      .sort({ score: { $meta: "textScore" }, rating: -1 })
      .limit(8)
      .lean();

    // ── Popular search tracking ───────────────────────────────────────────────
    const searchKey = { word: q.trim().toLowerCase(), type: typeLower || "general" };
    await PopularSearch.findOneAndUpdate(searchKey, { $inc: { totalSearches: 1 } }, { upsert: true });

    return res.status(200).json({ success: true, suggestions });
  } catch (error) {
    console.error("[getSearchSuggestions]", error);
    return res.status(500).json({ success: false, message: "Suggestions failed" });
  }
};


// ─── 2. MAIN SEARCH ────────────────────────────────────────────────────────────
export const search = async (req, res) => {
  let pageNum = 1;
  try {
    const { q: queryQ, search: searchQ, type, sort = "rating", page = 1, limit = 12, latitude, longitude } = req.query;

    pageNum         = Math.max(1, toInt(page, 1));
    const limitNum  = Math.min(50, Math.max(1, toInt(limit, 12)));
    const skip      = (pageNum - 1) * limitNum;
    const model     = getModel(type);
    const resolvedType = type?.toLowerCase();
    const finalQ    = (queryQ || searchQ || "").trim();

    // ── Build filter ──────────────────────────────────────────────────────────
    const baseMatch = { isVerified: true };
    const fullMatch = buildFilter(req.query, baseMatch);

    // Text search: use $text when query provided (hits weighted index),
    // otherwise fall back to regex for broad partial matches
    if (finalQ) {
      // $text is AND-based across words — good for "nigerian restaurant lekki"
      fullMatch.$text = { $search: finalQ };
    }

    // ── Geo stage ─────────────────────────────────────────────────────────────
    let geoNearStage = null;
    if (latitude && longitude) {
      const geoQuery = { ...fullMatch };
      delete geoQuery.location;
      // $text and $geoNear cannot coexist in the same pipeline stage.
      // When geo is active, switch text search to $or regex so it still works.
      if (geoQuery.$text) {
        delete geoQuery.$text;
        const regex = new RegExp(finalQ, "i");
        geoQuery.$or = [
          { businessName        : regex },
          { vendorTypeCategory  : regex },
          { address             : regex },
          { businessDescription : regex },
        ];
      }
      geoNearStage = {
        $geoNear: {
          near          : { type: "Point", coordinates: [toFloat(longitude), toFloat(latitude)] },
          distanceField : "distance",
          spherical     : true,
          query         : geoQuery,
          key           : "location",
          maxDistance   : 15000,
        },
      };
    }

    // ── Sort ──────────────────────────────────────────────────────────────────
    let sortStage;
    if (geoNearStage) {
      // Proximity-first when coords supplied
      sortStage = { distance: 1, totalScore: -1, rating: -1 };
    } else if (finalQ) {
      // Text-relevance first when searching
      sortStage = { textScore: { $meta: "textScore" }, totalScore: -1, rating: -1 };
    } else {
      switch (sort) {
        case "price_asc":  sortStage = { priceRange: 1 };   break;
        case "price_desc": sortStage = { priceRange: -1 };  break;
        case "newest":     sortStage = { createdAt: -1 };   break;
        default:           sortStage = { rating: -1, reviews: -1 };
      }
    }

    const subRegex = finalQ ? new RegExp(finalQ, "i") : null;

    // ── Pipeline ──────────────────────────────────────────────────────────────
    const pipeline = [
      ...(geoNearStage ? [geoNearStage] : [{ $match: fullMatch }]),

      // Inject textScore as a field so we can $sort by it later
      ...(finalQ && !geoNearStage
        ? [{ $addFields: { textScore: { $meta: "textScore" } } }]
        : []
      ),

      // ── Sub-collection joins ───────────────────────────────────────────────
      {
        $lookup: {
          from         : "menuitems",  // MenuItem model → "menuitems"
          localField   : "_id",
          foreignField : "vendor",     // MenuItem.vendor
          as           : "_menuItems",
        },
      },
      {
        $lookup: {
          from         : "roomtypes",  // RoomType model → "roomtypes"
          localField   : "_id",
          foreignField : "hotelId",    // RoomType.hotelId
          as           : "_rooms",
        },
      },
      {
        $lookup: {
          from         : "drinks",     // Drink model → "drinks"
          localField   : "_id",
          foreignField : "clubId",     // Drink.clubId
          as           : "_drinks",
        },
      },
      {
        $lookup: {
          from         : "tables",     // Table model → "tables"
          localField   : "_id",
          foreignField : "clubId",     // Table.clubId
          as           : "_tables",
        },
      },

      // ── Sub-collection match scoring ───────────────────────────────────────
      {
        $addFields: subRegex
          ? {
              _menuScore: {
                $size: {
                  $filter: {
                    input: "$_menuItems",
                    cond : { $regexMatch: { input: { $ifNull: ["$$this.name", ""] }, regex: subRegex } },
                  },
                },
              },
              _roomScore: {
                $size: {
                  $filter: {
                    input: "$_rooms",
                    cond : { $regexMatch: { input: { $ifNull: ["$$this.name", ""] }, regex: subRegex } },
                  },
                },
              },
              _drinkScore: {
                $size: {
                  $filter: {
                    input: "$_drinks",
                    cond : { $regexMatch: { input: { $ifNull: ["$$this.name", ""] }, regex: subRegex } },
                  },
                },
              },
              _tableScore: {
                $size: {
                  $filter: {
                    input: "$_tables",
                    cond : { $regexMatch: { input: { $ifNull: ["$$this.name", ""] }, regex: subRegex } },
                  },
                },
              },
            }
          : { _menuScore: 0, _roomScore: 0, _drinkScore: 0, _tableScore: 0 },
      },
      {
        $addFields: {
          totalScore: {
            $add: [
              { $multiply: ["$_menuScore",  8] },
              { $multiply: ["$_roomScore",  8] },
              { $multiply: ["$_drinkScore", 8] },
              { $multiply: ["$_tableScore", 8] },
            ],
          },
        },
      },

      { $sort: sortStage },
      { $skip: skip },
      { $limit: limitNum },

      // Project only the fields needed — drop internal _* fields
      {
        $project: {
          ...buildSelect(resolvedType).split(" ").reduce((o, f) => ({ ...o, [f]: 1 }), {}),
          ...(finalQ && !geoNearStage ? { textScore: 1 } : {}),
          distance   : geoNearStage ? 1 : 0,
          totalScore : 1,
        },
      },
    ];

    // ── Execute ───────────────────────────────────────────────────────────────
    const countMatch = { ...fullMatch };
    // $text can't be used in countMatch for a separate aggregate — reuse fullMatch safely
    const [vendors, countResult] = await Promise.all([
      model.aggregate(pipeline),
      model.aggregate([{ $match: countMatch }, { $count: "total" }]),
    ]);

    const totalCount = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / limitNum);

    // ── Facets (for filter sidebar) ───────────────────────────────────────────
    // Facets intentionally use a minimal match (no active filters) so counts
    // reflect what's available, not what's already filtered.
    const facets = await Vendor.aggregate([
      { $match: { isVerified: true, isVisible: true } },
      {
        $facet: {
          byType        : [{ $group: { _id: "$vendorType", count: { $sum: 1 } } }, { $sort: { count: -1 } }],
          byCuisine     : [{ $unwind: "$cuisines" }, { $group: { _id: "$cuisines", count: { $sum: 1 } } }, { $sort: { count: -1 } }],
          byMusicGenre  : [{ $unwind: "$musicGenres" }, { $group: { _id: "$musicGenres", count: { $sum: 1 } } }, { $sort: { count: -1 } }],
          byAmenity     : [{ $unwind: "$amenities" }, { $group: { _id: "$amenities", count: { $sum: 1 } } }, { $sort: { count: -1 } }],
          byPriceRange  : [{ $group: { _id: "$priceRange", count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
          ratingBuckets : [{ $bucket: { groupBy: "$rating", boundaries: [0,3,4,4.5,5.1], default: "unrated", output: { count: { $sum: 1 } } } }],
        },
      },
    ]);

    return res.status(200).json({
      success    : true,
      data       : vendors,
      pagination : {
        currentPage : pageNum,
        totalPages,
        totalCount,
        limit       : limitNum,
        hasNextPage : pageNum < totalPages,
        hasPrevPage : pageNum > 1,
      },
      facets : facets[0] || {},
      meta   : { q: finalQ, type: resolvedType, sort },
    });
  } catch (error) {
    console.error("[search]", error.message);
    return res.status(500).json({ success: false, message: `Search failed: ${error.message}` });
  }
};


// ─── 3. TRENDING ──────────────────────────────────────────────────────────────
export const getTrending = async (req, res) => {
  try {
    const { type, limit = 6 } = req.query;
    const hour = new Date().getHours();
    const filter = { isVerified: true };
    if (!type) {
      if      (hour >= 21 || hour < 4)  filter.vendorType = "club";
      else if (hour >= 11 && hour < 16) filter.vendorType = "restaurant";
      else if (hour < 11)               filter.vendorType = "hotel";
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


// ─── 4. DISCOVER ──────────────────────────────────────────────────────────────
export const discover = async (req, res) => {
  try {
    const { latitude, longitude, type } = req.query;
    const baseFilter  = { isOnboarded: true, isVerified: true };
    const selectBase  = "businessName vendorType address profileImages rating reviews priceRange vendorTypeCategory isVerified";
    const hasCoords   = latitude && longitude;
    const nearbyFilter = hasCoords
      ? { ...baseFilter, location: { $near: { $geometry: { type: "Point", coordinates: [toFloat(longitude), toFloat(latitude)] }, $maxDistance: 8000 } } }
      : { ...baseFilter };

    if (type) {
      const t = type.toLowerCase();
      if (["hotel","restaurant","club"].includes(t)) {
        nearbyFilter.vendorType = t;
        baseFilter.vendorType   = t;
      }
    }

    const [nearby, topRated, restaurants, hotels, clubs] = await Promise.all([
      Vendor.find(nearbyFilter).select(selectBase).limit(8).lean(),
      Vendor.find(baseFilter).select(selectBase).sort({ rating: -1, reviews: -1 }).limit(8).lean(),
      RestaurantVendor.find({ ...baseFilter, vendorType: "restaurant" }).select(`${selectBase} cuisines diningStyles dietaryOptions`).sort({ rating: -1, reviews: -1 }).limit(8).lean(),
      HotelVendor.find({ ...baseFilter, vendorType: "hotel" }).select(`${selectBase} starRating amenities mealPlan offer`).sort({ rating: -1 }).limit(8).lean(),
      ClubVendor.find({ ...baseFilter, vendorType: "club" }).select(`${selectBase} musicGenres venueType entryFee dressCode`).sort({ rating: -1 }).limit(8).lean(),
    ]);

    if (type && ["hotel","restaurant","club"].includes(type.toLowerCase())) {
      const t = type.toLowerCase();
      return res.status(200).json({
        success: true,
        data: {
          nearby      : nearby.filter(v => v.vendorType === t),
          topRated    : topRated.filter(v => v.vendorType === t),
          restaurants : t === "restaurant" ? restaurants : [],
          hotels      : t === "hotel"      ? hotels      : [],
          clubs       : t === "club"       ? clubs        : [],
        },
      });
    }
    return res.status(200).json({ success: true, data: { nearby, topRated, restaurants, hotels, clubs } });
  } catch (error) {
    console.error("[discover]", error);
    return res.status(500).json({ success: false, message: "Discover failed" });
  }
};


// ─── 5. DISCOVER BY TYPE ──────────────────────────────────────────────────────
export const discoverByType = async (req, res) => {
  try {
    const { type } = req.params;
    const { latitude, longitude } = req.query;
    const model      = getModel(type);
    const baseFilter = { isOnboarded: true, isVerified: true };
    const hasCoords  = latitude && longitude;
    const nearbyFilter = hasCoords
      ? { ...baseFilter, location: { $near: { $geometry: { type: "Point", coordinates: [toFloat(longitude), toFloat(latitude)] }, $maxDistance: 8000 } } }
      : { ...baseFilter };
    const [nearby, topRated, newest] = await Promise.all([
      model.find(nearbyFilter).select(buildSelect(type)).limit(6).lean(),
      model.find(baseFilter).select(buildSelect(type)).sort({ rating: -1, reviews: -1 }).limit(6).lean(),
      model.find(baseFilter).select(buildSelect(type)).sort({ createdAt: -1 }).limit(6).lean(),
    ]);
    return res.status(200).json({ success: true, type, data: { nearby, topRated, newest } });
  } catch (error) {
    console.error("[discoverByType]", error);
    return res.status(500).json({ success: false, message: "Discover by type failed" });
  }
};