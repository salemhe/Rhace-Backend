import User from "../models/user.model.js";
import Reservation from "../models/reservation.model.js";
import { Booking } from "../models/booking.model.js";
import { recordAuditLog } from "../utils/auditLogger.js";
import { sendPasswordResetEmail } from "../services/mail.service.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
import pkg from "json-2-csv";
import * as XLSX from "xlsx";
import { uploadToCloudinary } from "../utils/cloudinary.js";

const { AsyncParser } = pkg;

// @desc    Get all users with search, filter, sort, pagination
// @route   GET /api/users
// @access  Private (Admin, Manager)
export const getUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 1000,
      search,
      status,
      role,
      sortBy,
      sortOrder,
      isVIP,
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    if (status) query.status = status;
    if (role) query.role = role;
    if (isVIP !== undefined) query.isVIP = isVIP === "true";

    const sort = {};
    if (sortBy) {
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;
    } else {
      sort.createdAt = -1;
    }

    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sort,
    };

    const users = await User.paginate(query, options);

    // Add reservation count to each user
    for (let user of users.docs) {
      const reservationCount = await Reservation.countDocuments({ guest: user._id });
      const bookingCount = await Booking.countDocuments({ customerId: user._id });
      user.reservationCount = reservationCount + bookingCount;
    }

    // Update lastActive
    if (req.user && req.user._id) {
      await User.findByIdAndUpdate(req.user._id, { lastActive: new Date() });
    }

    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Change user password
// @route   PUT /api/users/profile/password
// @access  Private (Authenticated User)
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;


    console.log('Password change req.body:', { hasCurrent: !!currentPassword, hasNew: !!newPassword, currentLength: currentPassword?.length || 0, newLength: newPassword?.length || 0, bodyKeys: Object.keys(req.body || {}) });
    if (!currentPassword?.trim() || !newPassword?.trim() || currentPassword.trim().length === 0 || newPassword.trim().length === 0) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }


    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters long" });
    }

    // Get user from database (not from req.user which may have limited fields)
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user has a password (social login users may not have password)
    if (!user.password) {
      return res.status(400).json({ message: "Password not set for this account. Please use social login or contact support." });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Update password (the pre-save hook will hash it)
    user.password = newPassword;
    await user.save();

    // Record audit log
    if (req.user && req.user._id) {
      await recordAuditLog(req.user._id, "CHANGE_PASSWORD", "User", user._id, {
        changedBy: req.user._id,
      });
    }

    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user profile picture
// @route   PUT /api/users/profile/picture
// @access  Private (Authenticated User)
export const updateProfilePicture = async (req, res) => {
  // Validate Cloudinary config at runtime
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.error('Cloudinary not configured');
    return res.status(500).json({ message: 'Image service temporarily unavailable' });
  }

  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    // Get user from database
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Upload image to Cloudinary
    const imageUrl = await uploadToCloudinary(req.file.buffer, req.file.originalname);

    // Update user's profilePic
    user.profilePic = imageUrl;
    await user.save();

    // Record audit log
    if (req.user && req.user._id) {
      await recordAuditLog(req.user._id, "UPDATE_PROFILE_PICTURE", "User", user._id, {
        changedBy: req.user._id,
      });
    }

    res.status(200).json({ 
      message: "Profile picture updated successfully",
      profilePic: user.profilePic 
    });
  } catch (error) {
    console.error("Profile picture update failed for user", req.user?._id, {
      error: error.message,
      stack: error.stack,
      file: req.file ? {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      } : null
    });
    res.status(500).json({ message: "Failed to update profile picture", error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }

};

// @desc    Get single user by ID
// @route   GET /api/users/:id
// @access  Private (Admin, Manager)
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create new user
// @route   POST /api/users
// @access  Private (Admin)
export const createUser = async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone, role, isVIP } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const user = new User({
      firstName,
      lastName,
      email,
      password,
      phone,
      role: role || "guest",
      isVIP: isVIP || false,
    });

    const createdUser = await user.save();

    if (req.user && req.user._id) {
      await recordAuditLog(req.user._id, "CREATE_USER", "User", createdUser._id, {
        createdBy: req.user._id,
      });
    }

    res.status(201).json(createdUser);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private (Admin, Manager)
export const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { firstName, lastName, email, phone, role, isVIP, status } = req.body;

    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.email = email || user.email;
    user.phone = phone || user.phone;
    user.role = role || user.role;
    user.isVIP = isVIP !== undefined ? isVIP : user.isVIP;
    user.status = status || user.status;

    const updatedUser = await user.save();

    if (req.user && req.user._id) {
      await recordAuditLog(req.user._id, "UPDATE_USER", "User", user._id, {
        updatedBy: req.user._id,
        changes: req.body,
      });
    }

    res.status(200).json(updatedUser);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private (Admin)
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await User.findByIdAndDelete(req.params.id);

    if (req.user && req.user._id) {
      await recordAuditLog(req.user._id, "DELETE_USER", "User", req.params.id, {
        deletedBy: req.user._id,
      });
    }

    res.status(200).json({ message: "User removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Suspend/unsuspend user
// @route   PATCH /api/users/:id/status
// @access  Private (Admin, Manager)
export const toggleUserStatus = async (req, res) => {
  try {
    const { status } = req.body; // "active", "suspended"

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.status = status;
    await user.save();

    if (req.user && req.user._id) {
      await recordAuditLog(req.user._id, "CHANGE_USER_STATUS", "User", user._id, {
        changedBy: req.user._id,
        newStatus: status,
      });
    }

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Reset user password
// @route   POST /api/users/:id/reset-password
// @access  Private (Admin)
export const resetUserPassword = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    await sendPasswordResetEmail(user.email, resetToken, "user");

    if (req.user && req.user._id) {
      await recordAuditLog(req.user._id, "RESET_USER_PASSWORD", "User", user._id, {
        resetBy: req.user._id,
      });
    }

    res.status(200).json({ message: "Password reset email sent" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mark user as VIP
// @route   PATCH /api/users/:id/vip
// @access  Private (Admin, Manager)
export const toggleVIPStatus = async (req, res) => {
  try {
    const { isVIP } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isVIP = isVIP;
    await user.save();

    if (req.user && req.user._id) {
      await recordAuditLog(req.user._id, "CHANGE_VIP_STATUS", "User", user._id, {
        changedBy: req.user._id,
        newVIPStatus: isVIP,
      });
    }

    // Emit real-time update for VIP status change
    if (global.io) {
      global.io.to('admin_users').emit('user_update', {
        type: 'vip_status_change',
        userId: user._id,
        isVIP: user.isVIP,
        updatedBy: req.user ? req.user._id : null,
      });
    }

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user statistics
// @route   GET /api/users/stats
// @access  Private (Admin, Manager)
export const getUserStats = async (req, res) => {
  try {
    const total = await User.countDocuments();
    const active = await User.countDocuments({ status: "active" });
    const inactive = await User.countDocuments({ status: "inactive" });
    const suspended = await User.countDocuments({ status: "suspended" });
    const vip = await User.countDocuments({ isVIP: true });

    res.status(200).json({
      total,
      active,
      inactive,
      suspended,
      vip,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Export users to CSV/XLSX
// @route   GET /api/users/export
// @access  Private (Admin, Manager)
export const exportUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");

    const dataToExport = users.map((user) => ({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      isVIP: user.isVIP,
      lastActive: user.lastActive,
      createdAt: user.createdAt,
    }));

    const { format = "csv" } = req.query;

    if (format === "xlsx") {
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Users");
      const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      res.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.attachment("users.xlsx");
      return res.send(xlsxBuffer);
    } else {
      const parser = new AsyncParser();
      const csv = await parser.parse(dataToExport);

      res.header("Content-Type", "text/csv");
      res.attachment("users.csv");
      return res.send(csv);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
