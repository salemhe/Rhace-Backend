import User from "../models/user.model.js";
import { generateToken } from "../utils/jwt.js";
import crypto from "crypto";
import * as otpService from "../services/otp.service.js"; // New import

export const register = async (req, res) => {
  const { name, email, password, vendorType } = req.body; // Added vendorType

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const user = await User.create({
      name,
      email,
      password,
      vendorType, // Save vendorType
      isVerified: false, // User is not verified initially
    });

    if (user) {
      await otpService.sendAndSaveOTP(user.email); // Send OTP
      res.status(201).json({
        message: "User registered. Please verify your email with the OTP sent to your inbox.",
        userId: user._id,
        email: user.email,
      });
    } else {
      res.status(400).json({ message: "Invalid user data" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
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
      return res.status(401).json({ message: "Please verify your email with the OTP sent to your inbox." });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      vendorType: user.vendorType, // Include vendorType in login response
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const verifyOTP = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const isOTPValid = await otpService.verifyOTP(email, otp);

    if (!isOTPValid) {
      return res.status(400).json({ message: "Invalid or expired OTP." });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.isVerified = true;
    await user.save();

    res.status(200).json({
      message: "Email verified successfully.",
      _id: user._id,
      name: user.name,
      email: user.email,
      vendorType: user.vendorType,
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const resendOTP = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "User already verified." });
    }

    await otpService.sendAndSaveOTP(email);
    res.status(200).json({ message: "OTP resent successfully." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

import { sendPasswordResetEmail } from "../services/mail.service.js";

export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

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

    res.json({ message: "Password reset email sent" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const resetPassword = async (req, res) => {
  const { token, password } = req.body;

  try {
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
