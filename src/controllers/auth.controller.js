import User from "../models/user.model.js";
import { generateToken } from "../utils/jwt.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
import * as otpService from "../services/otp.service.js"; // New import
import { sendPasswordResetEmail } from "../services/mail.service.js";
import { Vendor } from "../models/vendor.model.js";

export const loginVendor = async (req, res) => {
  const { email, password } = req.body;
  const vendor = await Vendor.findOne({ email });

  try {
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    const isMatch = await bcrypt.compare(password, vendor.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password." });
    }

    if (!vendor.isVerified) {
      return res.status(401).json({
        message: "Please verify your email with the OTP sent to your inbox.",
      });
    }

    const token = generateToken(
      vendor._id,
      vendor.role,
      vendor.isOnboarded,
      vendor.vendorType
    );

    return res
      .status(200)
      .json({ message: "Login successful.", vendor, token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Error adding vendor.",
      error: err.message,
    });
  }
};

export const registerVendor = async (req, res) => {
  try {
    const { businessName, vendorType, email, phone, address, password } =
      req.body;

    if (
      !businessName ||
      !vendorType ||
      !email ||
      !phone ||
      !address ||
      !password
    ) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const existingVendor = await Vendor.findOne({ email });
    if (existingVendor) {
      return res
        .status(409)
        .json({ message: "Vendor with this email already exists." });
    }

    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters long." });
    }

    const data = {
      businessName,
      email,
      phone,
      address,
      password,
      otp,
      otpExpires,
    };

    let newVendor;

    switch (vendorType) {
      case "hotel":
        newVendor = await HotelVendor.create(data);
        break;
      case "restaurant":
        newVendor = await RestaurantVendor.create(data);
        break;
      case "club":
        newVendor = await ClubVendor.create(data);
        break;
      default:
        return res.status(400).json({ message: "Invalid vendor type" });
    }

    await otpService.sendAndSaveOTP(newVendor.email); // Send OTP

    const token = generateToken(
      newVendor._id,
      newVendor.role,
      newVendor.isOnboarded,
      newVendor.vendorType
    );

    return res.status(201).json({
      message:
        "Vendor created successfully. Please verify your email with the OTP sent to your inbox",
      vendor: newVendor,
      token,
    });
  } catch (error) {
    console.error(error);
    if (error.code === 11000) {
      return res.status(409).json({ message: "Duplicate email error." });
    }
    return res.status(500).json({
      message: "Error adding vendor.",
      error: error.message,
    });
  }
};

export const register = async (req, res) => {
  const { firstName, lastName, email, password, phone } = req.body; // Added vendorType

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      phone,
      isVerified: false,
    });

    if (user) {
      await otpService.sendAndSaveOTP(user.email); // Send OTP
      return res.status(201).json({
        message:
          "User registered. Please verify your email with the OTP sent to your inbox.",
        userId: user._id,
        email: user.email,
      });
    } else {
      return res.status(400).json({ message: "Invalid user data" });
    }
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.isVerified) {
      return res.status(401).json({
        message: "Please verify your email with the OTP sent to your inbox.",
      });
    }

    return res.json({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      token: generateToken(user._id, "user"),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const verifyOTP = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const isOTPValid = await otpService.verifyOTP(email, otp);

    if (!isOTPValid) {
      return res.status(400).json({ message: "Invalid or expired OTP." });
    }

    const guest = await User.findOne({ email });
    const vendor = await Vendor.findOne({ email });

    const user = guest ? guest : vendor;

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.isVerified = true;
    await user.save();

    return res.status(200).json({
      message: "Email verified successfully.",
      _id: user._id,
      email: user.email,
      vendorType: user.vendorType,
      token: generateToken(
        user._id,
        user.role,
        user.isOnboarded,
        user.vendorType
      ),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const resendOTP = async (req, res) => {
  const { email } = req.body;

  try {
    const guest = await User.findOne({ email });
    const vendor = await Vendor.findOne({ email });

    const user = guest ? guest : vendor;

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "User already verified." });
    }

    await otpService.sendAndSaveOTP(email);
    return res.status(200).json({ message: "OTP resent successfully." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const guest = await User.findOne({ email });
    const vendor = await Vendor.findOne({ email });

    const user = guest ? guest : vendor;

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const resetToken = crypto.randomBytes(20).toString("hex");

    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save();

    await sendPasswordResetEmail(user.email, resetToken);

    return res.json({ message: "Password reset email sent" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const resetPassword = async (req, res) => {
  const { token, password } = req.body;

  try {
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const guest = await User.findOne({
      resetPasswordToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    const vendor = await Vendor.findOne({
      resetPasswordToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    const user = guest ? guest : vendor;

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return res.json({ message: "Password reset successful" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
