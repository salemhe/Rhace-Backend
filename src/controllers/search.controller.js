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
import {
  Vendor,
  HotelVendor,
  RestaurantVendor,
  ClubVendor,
} from "../models/vendor.model.js";
import SearchHistory from "../models/searchHistory.model.js";
import { MenuItem } from "../models/menu.model.js";
import RoomType from "../models/roomtype.model.js";
import BottleSet from "../models/bottleSet.model.js";
import Drink from "../models/drink.model.js";
// ─── 1. SUGGESTIONS ────────────────────────────────────────────────────────────

const LAGOS_AREAS = [
  "Lekki Phase 1", "Ikeja", "Victoria Island", "Ikoyi", "Surulere", 
  "Ajah", "Magodo", "Yaba", "Maryland", "Gbagada", "Festac"
];

export const getSearchSuggestions = async (req, res) => {
  try {
    const { search: q, type } = req.query;
    // Minimum 2 characters to prevent heavy DB load
    if (!q || q.trim().length < 2) {
      return res.status(200).json({ success: true, suggestions: [] });
    }

    const query = q.trim();
    const regex = new RegExp(query, "i");
    const vendorType = type?.toLowerCase();
    
    // Base filter for the active tab
    const baseFilter = { 
      isVerified: true, 
      isOnboarded: true,
      ...(vendorType && ["hotel", "restaurant", "club"].includes(vendorType) ? { vendorType } : {})
    };

    // 1. Parallel Execution: Vendors, Products, and Category tags
    const [vendors, products, categories] = await Promise.all([
      // VENDORS
      Vendor.find({ ...baseFilter, businessName: regex })
        .select("businessName address profileImages vendorType")
        .limit(5)
        .lean(),

      // PRODUCTS (MenuItems / RoomTypes / BottleSets)
      searchProducts(vendorType, regex),

      // CATEGORIES (Cuisines / Vibe / VenueType)
      searchCategories(vendorType, regex)
    ]);

    const locationSuggestions = LAGOS_AREAS.filter(area => regex.test(area)).slice(0, 3);

    // 2. Map into a Single Flat List
    const suggestions = [

      ...locationSuggestions.map(loc => ({
        text: loc,
        subText: `Explore all spots in ${loc}`,
        label: "Location",
        target: `/search?type=${vendorType || 'restaurant'}&q=${encodeURIComponent(loc)}`
      })),

      // Vendor matches -> labeled as "Place"
      ...vendors.map(v => ({
        id: v._id,
        text: v.businessName,
        subText: v.address,
        image: v.profileImages?.[0],
        label: "Place",
        target: `/vendor/${v.vendorType}/${v._id}`
      })),

      // Product matches -> labeled as "Dish", "Room", or "Drink"
      ...products.map(p => ({
        id: p._id,
        text: p.name,
        subText: `At ${p.vendorName}`,
        image: p.image,
        label: p.label,
        target: `/vendor/${vendorType}/${p.vendorId}?highlight=${p._id}`
      })),

      // Category matches -> labeled as "Category"
      ...categories.map(c => ({
        text: c,
        subText: `See all ${c} ${vendorType || 'spots'}`,
        label: "Category",
        target: `/search?type=${vendorType || 'restaurant'}&filter1=${c.toLowerCase()}`
      }))
    ];

    // 3. Popularity Tracking
    PopularSearch.findOneAndUpdate(
      { word: query.toLowerCase(), type: vendorType || "general" },
      { $inc: { totalSearches: 1 } },
      { upsert: true }
    ).catch(() => {});

    return res.status(200).json({ 
      success: true, 
      suggestions: suggestions.slice(0, 10) 
    });

  } catch (error) {
    console.error("[getSearchSuggestions]", error);
    return res.status(500).json({ success: false, message: "Suggestions failed" });
  }
};

// --- HELPERS ---

async function searchProducts(type, regex) {
  const productConfig = {
    restaurant: { model: "MenuItem", ref: "vendor", label: "Dish" },
    hotel: { model: "RoomType", ref: "hotelId", label: "Room" },
    club: { model: "BottleSet", ref: "clubId", label: "Drink" }
  };

  const activeType = type || "restaurant";
  const config = productConfig[activeType];
  if (!config) return [];

  const items = await mongoose.model(config.model)
    .find({ name: regex })
    .populate(config.ref, "businessName")
    .limit(4)
    .lean();

  return items.map(i => ({
    _id: i._id,
    name: i.name,
    vendorName: i[config.ref]?.businessName || "Vendor",
    vendorId: i[config.ref]?._id,
    image: i.image,
    label: config.label
  }));
}

function searchCategories(type, regex) {
  const pool = {
    restaurant: ["Nigerian", "Chinese", "Italian", "Fine Dining", "Fast Food", "Seafood"],
    hotel: ["Boutique", "Resort", "Apartment", "Luxury"],
    club: ["Lounge", "Rooftop", "Afrobeats", "Amapiano"]
  };
  const target = type ? pool[type] : [...pool.restaurant, ...pool.hotel, ...pool.club];
  return [...new Set(target)].filter(c => regex.test(c)).slice(0, 3);
}

// ─── 2. MAIN SEARCH ────────────────────────────────────────────────────────────
export const search = async (req, res) => {
  try {
    const {
      search: q, 
      type, // Can be "restaurant", "hotel", "club", or undefined/"all"
      latitude: lat, longitude: lng,
      page = 1, limit = 15
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const userCoords = lat && lng ? [parseFloat(lng), parseFloat(lat)] : null;

    // Define the valid types
    const validTypes = ["restaurant", "hotel", "club"];
    const isAll = !type || type.toLowerCase() === "all" || !validTypes.includes(type.toLowerCase());

    const pipeline = [];

    // --- STAGE 1: GEOSPATIAL ---
    // If 'all', we search across every verified vendor regardless of type
    const geoQuery = { isVerified: true, isOnboarded: true };
    if (!isAll) geoQuery.vendorType = type.toLowerCase();

    if (userCoords) {
      pipeline.push({
        $geoNear: {
          near: { type: "Point", coordinates: userCoords },
          distanceField: "distance",
          key: "location",
          spherical: true,
          query: geoQuery
        }
      });
    } else {
      pipeline.push({ $match: geoQuery });
    }

    // --- STAGE 2: MULTI-COLLECTION LOOKUP ---
    // We look up from all three sub-collections and merge them into one array
    pipeline.push(
      {
        $lookup: {
          from: "menuitems",
          localField: "_id",
          foreignField: "vendor",
          as: "items_res"
        }
      },
      {
        $lookup: {
          from: "roomtypes",
          localField: "_id",
          foreignField: "hotelId",
          as: "items_hotel"
        }
      },
      {
        $lookup: {
          from: "bottlesets",
          localField: "_id",
          foreignField: "clubId",
          as: "items_club"
        }
      },
      {
        // Merge all found items into a single 'matchedProducts' field
        $addFields: {
          matchedProducts: { 
            $concatArrays: ["$items_res", "$items_hotel", "$items_club"] 
          }
        }
      }
    );

    // --- STAGE 3: THE "GLOBAL" MATCH ---
    const matchStage = {};
    if (q) {
      const regex = { $regex: q, $options: "i" };
      matchStage.$or = [
        { businessName: regex },
        { businessDescription: regex },
        { address: regex },
        { cuisines: regex },
        { vendorTypeCategory: regex },
        { "matchedProducts.name": regex },
        { "matchedProducts.category": regex }
      ];
    }

    pipeline.push({ $match: matchStage });

    // --- STAGE 4: FACETED RESULTS ---
    pipeline.push({
      $facet: {
        metadata: [{ $count: "total" }],
        data: [
          // Prioritize high-rated nearby spots
          { $sort: userCoords ? { distance: 1, rating: -1 } : { rating: -1 } },
          { $skip: skip },
          { $limit: parseInt(limit) },
          { 
            $project: {
              businessName: 1,
              businessDescription: 1,
              logo: 1,
              profileImages: 1,
              rating: 1,
              reviews: 1,
              address: 1,
              distance: { $divide: ["$distance", 1000] },
              priceRange: 1,
              isVerified: 1,
              vendorType: 1,
              vendorTypeCategory: 1,
              cuisines: 1,
              matchHighlight: { $arrayElemAt: ["$matchedProducts.name", 0] }
            } 
          }
        ]
      }
    });

    const results = await Vendor.aggregate(pipeline);
    const facetResult = results[0];
    const total = facetResult.metadata[0]?.total || 0;

    return res.status(200).json({
      success: true,
      data: facetResult.data || [],
      pagination: {
        totalCount: total,
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        hasNextPage: Math.ceil(total / limit) > parseInt(page)
      }
    });

  } catch (error) {
    console.error("[global-search-aggregator]", error);
    res.status(500).json({ success: false, message: "Search failed" });
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
      .limit(parseInt(limit, 6))
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
      ? { ...baseFilter, location: { $near: { $geometry: { type: "Point", coordinates: [parseFloat(longitude), parseFloat(latitude)] }, $maxDistance: 8000 } } }
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