import Review from "../models/review.model.js";
import Club from "../models/club.model.js";
import mongoose from "mongoose";
import { recordAuditLog } from "../utils/auditLogger.js";
import { Vendor } from "../models/vendor.model.js";

export const createReview = async (req, res) => {
  try {
    const { rating, comment, user, vendor } = req.body;

    // Create and save new review
    const review = new Review({ vendor, rating, comment, user });
    await review.save();

    // Recalculate restaurant average rating
    const allReviews = await Review.find({ vendor });
    const avgRating =
      allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;

    await Vendor.findByIdAndUpdate(vendor, {
      rating: avgRating.toFixed(1),
      reviews: allReviews.length,
    });

    res.status(201).json(review);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ vendor: req.params.vendor })
      .sort({ createdAt: -1 });
    res.json({data: reviews});
  } catch (err) {
    res.status(500).json({ message: err.message });
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
