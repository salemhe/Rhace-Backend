import express from "express";
import {
  getSearchSuggestions,
  search,
  getTrending,
  discover,
  discoverByType,   // ← NEW
} from "../controllers/search.controller.js";

const router = express.Router();

// GET /api/search/suggestions?q=eko&type=hotel
router.get("/suggestions", getSearchSuggestions);

// GET /api/search/trending?type=restaurant
router.get("/trending", getTrending);

// GET /api/search/discover?latitude=6.5&longitude=3.3
router.get("/discover", discover);

// GET /api/search/discover/restaurants?latitude=6.5&longitude=3.3  ← NEW
router.get("/discover/:type", discoverByType);

// GET /api/search?q=pizza&type=restaurant&page=1&sort=rating
router.get("/", search);

export default router;