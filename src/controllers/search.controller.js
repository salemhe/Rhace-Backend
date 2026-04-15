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
export const getSearchSuggestions = async (req, res) => {
  try {
    const { search: q, type = "restaurant" } = req.query;
    if (!q || q.length < 2) return res.status(200).json({ success: true, suggestions: [] });

    const regex = new RegExp(`^${q}`, "i");
    const vendorType = type;

    // Parallel execution for speed
    const [vendors, products] = await Promise.all([
      // 1. Search Vendors
      Vendor.find({ vendorType, businessName: regex, isVerified: true })
        .select("businessName logo address")
        .limit(3).lean(),

      // 2. Search specific products based on the vendorType
      getProductSuggestions(vendorType, regex)
    ]);

   const vendorSuggestions = vendors.map(v => ({
      type: "vendor",
      label: v.businessName,
      subLabel: v.address,
    }));

    // 3. Format Product Suggestions (Search Redirects)
    const productSuggestions = products.map(p => {
        const isMultiple = p.vendorCount > 1;
        return {
            type: "product",
            label: p._id, // The grouped name (e.g., "Jollof Rice")
            subLabel: isMultiple ? `Available at ${p.vendorCount} spots` : `Available at ${p.representativeVendor.businessName}`,
        };
    });

    return res.status(200).json({
      success: true,
      suggestions: [...vendorSuggestions, ...productSuggestions]
    });
  } catch (error) {
    console.error("SuggestionErrpr", error)
    res.status(500).json({ success: false, message: "Suggestion error" });
  }
};

// Helper to switch between MenuItem, RoomType, and BottleSet
const getProductSuggestions = async (type, regex) => {
  const model = type === "restaurant" ? MenuItem : (type === "hotel" ? RoomType : BottleSet);
  const vendor = type === "restaurant" ? "vendor" : (type === "hotel" ? "hotelId" : "clubId");
  const price = type === "hotel" ? "$price" : "$pricePerNight"

  return await model.aggregate([
    { $match: { name: regex } },
    {
      $lookup: {
        from: "vendors",
        localField: vendor,
        foreignField: "_id",
        as: "vendorData"
      }
    },
    { $unwind: "$vendorData" },
    {
      $group: {
        _id: "$name",
        vendorCount: { $sum: 1 },
        representativeVendor: { $first: "$vendorData" },
        representativeItemId: { $first: "$_id" }
      }
    },
    { $limit: 5 }
  ]);
};

// ─── 2. MAIN SEARCH ────────────────────────────────────────────────────────────

export const search = async (req, res) => {
  try {
    const {
      search: q, 
      type = "restaurant",
      latitude: lat, longitude: lng,
      filter1, filter2,
      page = 1, limit = 15
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const userCoords = lat && lng ? [parseFloat(lng), parseFloat(lat)] : null;

    const productCollections = { 
      restaurant: { type: "menuitems", vendor: "vendor", f1: "cuisines", f2: "diningStyles" }, 
      hotel: { type: "roomtypes", vendor: "hotelId", f1: "propertyType", f2: "starRating" }, 
      club: { type: "bottlesets", vendor: "clubId", f1: "venueType", f2: "agePolicy" }
    };

    const subCollection = productCollections[type].type;
    const subIds = productCollections[type].vendor;

    const pipeline = [];

    // --- STAGE 1: GEOSPATIAL (Broad Net) ---
    // Remove 'q' from geoQuery so we don't kill potential menu matches early
    const geoQuery = { vendorType: type, isVerified: true };

    if (userCoords) {
      pipeline.push({
        $geoNear: {
          near: { type: "Point", coordinates: userCoords },
          distanceField: "distance",
          key: "location",
          spherical: true,
          query: geoQuery // Only basic type/verified filters here
        }
      });
    } else {
      pipeline.push({ $match: geoQuery });
    }

    // --- STAGE 2: LOOKUP (Attach Menu/Room/Bottle items) ---
    pipeline.push({
      $lookup: {
        from: subCollection,
        localField: "_id",
        foreignField: subIds,
        as: "matchedProducts"
      }
    });

    // --- STAGE 3: MATCHING (The Deep Search) ---
    const matchStage = {};
    if (q) {
      // This is where we check BOTH vendor name and menu item names
      matchStage.$or = [
        { businessName: { $regex: q, $options: "i" } },
        { businessDescription: { $regex: q, $options: "i" } },
        { "matchedProducts.name": { $regex: q, $options: "i" } }, // This now works!
        { vendorTypeCategory: { $regex: q, $options: "i" } }
      ];
    }

    // Apply Minimalist Filters
    if (type === "restaurant") {
      if (filter1) matchStage.cuisines = { $in: [filter1] };
      if (filter2) matchStage.diningStyles = { $in: [filter2] };
    } else if (type === "hotel") {
      if (filter1) matchStage.propertyType = filter1;
      if (filter2) matchStage.starRating = parseInt(filter2);
    } else if (type === "club") {
      if (filter1) matchStage.venueType = filter1;
      if (filter2) matchStage.agePolicy = filter2;
    }

    pipeline.push({ $match: matchStage });

    // --- STAGE 4: FLATTENED FACET ---
    pipeline.push({
      $facet: {
        metadata: [{ $count: "total" }],
        f1Options: [
          { $unwind: `$${productCollections[type].f1}` },
          { $group: { _id: `$${productCollections[type].f1}`, count: { $sum: 1 } } }
        ],
        f2Options: [
          { $group: { _id: `$${productCollections[type].f2}`, count: { $sum: 1 } } }
        ],
        data: [
          { $sort: userCoords ? { distance: 1 } : { rating: -1 } },
          { $skip: skip },
          { $limit: parseInt(limit) },
          { 
            $project: {
              businessName: 1,
              businessDescription: 1,
              logo: 1,
              profileImages: 1,
              rating: 1,
              distance: { $divide: ["$distance", 1000] },
              priceRange: 1,
              isVerified: 1,
              vendorType: 1
            } 
          }
        ]
      }
    });

    const results = await Vendor.aggregate(pipeline);
    const facetResult = results[0];

    return res.status(200).json({
      success: true,
      data: facetResult.data || [],
      filters: {
        primary: facetResult.f1Options?.map(f => ({ label: f._id, count: f.count })) || [],
        secondary: facetResult.f2Options?.map(f => ({ label: f._id, count: f.count })) || []
      },
      pagination: {
        totalCount: facetResult.metadata[0]?.total || 0,
        currentPage: parseInt(page),
        totalPages: Math.ceil((facetResult.metadata[0]?.total || 0) / limit),
        hasNextPage: Math.ceil((facetResult.metadata[0]?.total || 0) / limit) > parseInt(page),
        hasPrevPage: Math.ceil((facetResult.metadata[0]?.total || 0) / limit) < parseInt(page)
      }
    });

  } catch (error) {
    console.error("[aggregate-search]", error);
    res.status(500).json({ success: false, message: "Search Aggregator failed" });
  }
};
// ─── 4. DISCOVER ──────────────────────────────────────────────────────────────

export const discover = async (req, res) => {
  try {
    const { latitude, longitude, type = "restaurant" } = req.query;
    const vendorType = ["hotel", "restaurant", "club"].includes(type)
      ? type
      : "restaurant";
    const userId = req.user?._id;

    const userCoords =
      latitude && longitude
        ? [parseFloat(longitude), parseFloat(latitude)]
        : null;

    // 1. Fetch User History
    const recentSearches = userId
      ? await SearchHistory.find({ user: userId, vendorType })
          .sort({ createdAt: -1 })
          .limit(4)
          .lean()
      : [];

    // 2. Build the Aggregation Pipeline
    const pipeline = [];

    // GEO STAGE: Must be first
    if (userCoords) {
      pipeline.push({
        $geoNear: {
          near: { type: "Point", coordinates: userCoords },
          distanceField: "distance",
          maxDistance: 10000, // 10km
          query: { vendorType, isVerified: true },
          spherical: true,
        },
      });
    } else {
      pipeline.push({ $match: { vendorType, isVerified: true } });
    }

    // LOOKUP STAGE: Pull specific "Discovery Highlights" based on type
    if (vendorType === "restaurant") {
      pipeline.push({
        $lookup: {
          from: "menuitems",
          localField: "_id",
          foreignField: "vendor",
          as: "items",
        },
      });
    } else if (vendorType === "hotel") {
      pipeline.push({
        $lookup: {
          from: "roomtypes",
          localField: "_id",
          foreignField: "hotelId",
          as: "items",
        },
      });
    } else {
      // Clubs: Lookup Tables or BottleSets
      pipeline.push({
        $lookup: {
          from: "drinks",
          localField: "_id",
          foreignField: "clubId",
          as: "items",
        },
      });
    }

    // Limit and Sort
    pipeline.push({ $sort: { rating: -1 } });
    pipeline.push({ $limit: 12 });

    const rawVendors = await Vendor.aggregate(pipeline);

    // 3. Section Construction
    const sections = [];

    // SECTION 5: PRODUCT DISCOVERY
    const productItems = [];
    rawVendors.forEach((vendor) => {
      if (vendor.items && vendor.items.length > 0) {
        // Grab the first or most popular item
        const item = vendor.items[0];
        productItems.push({
          id: item._id,
          name: item.name,
          price: `₦${item.price?.toLocaleString() || item.pricePerNight.toLocaleString()}`,
          vendorName: vendor.businessName,
          image: item.image || vendor.profileImages?.[0],
          // Redirect to the vendor, but keep the product context
          target: `/search?type=${vendorType}&q=${item.name}`,
        });
      }
    });

    if (productItems.length > 0) {
      sections.push({
        title:
          vendorType === "restaurant"
            ? "Must-Try Dishes"
            : vendorType === "hotel"
              ? "Featured Rooms"
              : "Bottle Service & Drinks",
        layout: "product_scroll",
        items: productItems.slice(0, 6),
      });
    }

    // SECTION: History
    if (recentSearches.length > 0) {
      sections.push({
        title: "Continue where you left off",
        layout: "horizontal_chips",
        items: recentSearches.map((s) => ({
          label: s.query || "Viewed Vendor",
          target: s.clickedVendor
            ? `/${vendorType}s/${s.clickedVendor}`
            : `/search?type=${vendorType}&q=${s.query}`,
        })),
      });
    } else if (rawVendors.length > 0) {
      // Fallback for new users: Show "New on the Platform"
      sections.push({
        title: `Explore ${vendorType.charAt(0).toUpperCase() + vendorType.slice(1)}s`,
        layout: "large_cards",
        items: rawVendors.slice(0, 3).map((v) => ({
          id: v._id,
          name: v.businessName,
          image: v.profileImages?.[0],
          badge: v.distance
            ? `${(v.distance / 1000).toFixed(1)}km near you`
            : "Top Rated",
          target: `/${vendorType}s/${v._id}`,
        })),
      });
    }

    // SECTION: Nearby (Using the 0.4km logic)
    const nearbyItems = rawVendors
      .filter((v) => v.distance <= 5000)
      .map((v) => ({
        id: v._id,
        name: v.businessName,
        image: v.profileImages?.[0],
        rating: v.rating,
        badge: v.distance
          ? `${(v.distance / 1000).toFixed(1)}km near you`
          : null,
        description: v.items?.[0]?.name
          ? `Try the ${v.items[0].name}`
          : v.businessDescription,
        target: `/${vendorType}s/${v._id}`,
      }));

    if (nearbyItems.length > 0) {
      sections.push({
        title: "Quickly Reachable",
        layout: "large_cards",
        items: nearbyItems,
      });
    }

    // SECTION: Type-Specific Discovery Funnel
    sections.push(getDiscoveryFunnel(vendorType));

    return res.status(200).json({ success: true, vendorType, sections });
  } catch (error) {
    console.error("[discover]", error);
    return res
      .status(500)
      .json({ success: false, message: "Discovery failed" });
  }
};

const getDiscoveryFunnel = (type) => {
  const configs = {
    restaurant: {
      title: "What are you craving?",
      items: [
        {
          label: "Nigerian",
          target: "/search?type=restaurant&cuisines=nigerian",
        },
        {
          label: "Fine Dining",
          target: "/search?type=restaurant&diningStyles=fine-dining",
        },
        {
          label: "Breakfast",
          target: "/search?type=restaurant&mealTimes=breakfast",
        },
      ],
    },
    hotel: {
      title: "Plan your stay",
      items: [
        { label: "Luxury (5-Star)", target: "/search?type=hotel&starRating=5" },
        { label: "With Pool", target: "/search?type=hotel&amenities=pool" },
        {
          label: "Boutique",
          target: "/search?type=hotel&propertyType=boutique",
        },
      ],
    },
    club: {
      title: "Nightlife & Vibes",
      items: [
        { label: "Amapiano", target: "/search?type=club&musicGenres=amapiano" },
        {
          label: "Rooftop Lounges",
          target: "/search?type=club&venueType=rooftop",
        },
        { label: "VIP Tables", target: "/search?type=club&hasVIPTables=true" },
      ],
    },
  };
  return { ...configs[type], layout: "circular_chips" };
};