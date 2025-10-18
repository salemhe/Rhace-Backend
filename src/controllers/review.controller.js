import Review from "../models/review.model.js";
import Club from "../models/club.model.js";
import mongoose from "mongoose";
import { recordAuditLog } from "../utils/auditLogger.js";

// @desc    Create a new review for a club
// @route   POST /api/reviews
// @access  Private
export const createReview = async (req, res) => {
  try {
    const { clubId, rating, reviewText } = req.body;
    const userId = req.user._id;

    // Check if club exists
    const club = await Club.findById(clubId);
    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    // Check if user already reviewed this club
    const existingReview = await Review.findOne({ clubId, userId });
    if (existingReview) {
      return res.status(400).json({ message: "You have already reviewed this club" });
    }

    const review = new Review({ clubId, userId, rating, reviewText });
    await review.save();

    recordAuditLog(userId, "CREATE_REVIEW", "Review", review._id, review.toObject());

    res.status(201).json(review);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all reviews for a club
// @route   GET /api/reviews
// @access  Public
export const getReviewsForClub = async (req, res) => {
  try {
    const { clubId, page = 1, limit = 10, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    const query = { clubId };

    const totalReviews = await Review.countDocuments(query);

    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const reviews = await Review.find(query)
      .populate("userId", "name")
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Calculate average rating
    const avgRating = await Review.aggregate([
      { $match: { clubId: mongoose.Types.ObjectId(clubId) } },
      { $group: { _id: null, average: { $avg: "$rating" } } }
    ]);
    const averageRating = avgRating.length > 0 ? avgRating[0].average : 0;

    res.status(200).json({
      total: totalReviews,
      page: parseInt(page),
      limit: parseInt(limit),
      averageRating,
      reviews,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a review
// @route   PUT /api/reviews/:id
// @access  Private (own review)
export const updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, reviewText } = req.body;
    const userId = req.user._id;

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    if (review.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Not authorized to update this review" });
    }

    review.rating = rating || review.rating;
    review.reviewText = reviewText || review.reviewText;
    await review.save();

    recordAuditLog(userId, "UPDATE_REVIEW", "Review", review._id, review.toObject());

    res.status(200).json(review);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a review
// @route   DELETE /api/reviews/:id
// @access  Private (own review or admin)
export const deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role; // Assuming role is available

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    if (review.userId.toString() !== userId.toString() && userRole !== "admin") {
      return res.status(403).json({ message: "Not authorized to delete this review" });
    }

    await review.deleteOne();
    recordAuditLog(userId, "DELETE_REVIEW", "Review", id, {});

    res.status(200).json({ message: "Review removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
