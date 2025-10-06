import User from "../models/user.model.js";
import { generateToken } from "../utils/jwt.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
import * as otpService from "../services/otp.service.js"; // New import
import { sendPasswordResetEmail } from "../services/mail.service.js";
import {
  Vendor,
  HotelVendor,
  RestaurantVendor,
  ClubVendor,
} from "../models/vendor.model.js";

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
    const { businessName, email, password } = req.body;
    console.log(req.body);
    if (!businessName || !email || !password) {
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

    const newVendor = await Vendor.create({
      businessName,
      email,
      password,
    });

    await otpService.sendAndSaveOTP(newVendor.email); // Send OTP

    return res.status(201).json({
      message:
        "Vendor created successfully. Please verify your email with the OTP sent to your inbox",
      vendor: newVendor,
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

export const onboardVendor = async (req, res) => {
  try {
    const id = req.user._id;

    const {
      vendorType,
      profileImages, // array of Cloudinary URLs
      address,
      phone,
      website,
      priceRange,
      businessDescription,
      accountName,
      accountNumber,
      bankName,
      bankCode,
      // extra fields depending on vendorType
      openingTime,
      closingTime,
      cuisines,
      availableSlots,
      categories,
      slots,
      dressCode,
      ageLimit,
      offer,
    } = req.body;

    // Find vendor
    let vendor = await Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found." });
    }

    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ message: "Paystack key not configured." });
    }

    const recipientPayload = {
      type: "nuban",
      business_name: vendor.businessName,
      account_number: accountNumber,
      settlement_bank: bankCode,
      currency: "NGN",
      percentage_charge: 8,
    };

    const recipientResponse = await fetch(
      "https://api.paystack.co/subaccount",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(recipientPayload),
      }
    );

    const recipientData = await recipientResponse.json();
    if (!recipientResponse.ok || !recipientData.status) {
      return res
        .status(500)
        .json({ message: "Paystack error", error: recipientData.message });
    }

    // Basic updates
    vendor.profileImages = profileImages || vendor.profileImages;
    vendor.address = address || vendor.address;
    vendor.businessDescription = businessDescription || vendor.businessDescription;
    vendor.phone = phone || vendor.phone;
    vendor.website = website || vendor.website;
    vendor.priceRange = priceRange || vendor.priceRange;
    vendor.isOnboarded = true;
    vendor.paymentDetails = {
      bankCode,
      accountNumber,
      subaccountCode: recipientData.data.subaccount_code,
      bankName,
      accountName,
    } || vendor.paymentDetails;
    vendor.vendorType = vendorType || vendor.vendorType

    // 🔑 Handle vendorType-specific onboarding
    switch (vendorType) {
      case "hotel":
        await HotelVendor.findByIdAndUpdate(vendor._id, {
          offer,
        });
        break;

      case "restaurant":
        await RestaurantVendor.findByIdAndUpdate(vendor._id, {
          openingTime,
          closingTime,
          cuisines,
          availableSlots,
        });
        break;

      case "club":
        await ClubVendor.findByIdAndUpdate(vendor._id, {
          openingTime,
          closingTime,
          slots,
          categories,
          offer,
          dressCode,
          ageLimit,
        });
        break;

      default:
        return res.status(400).json({ message: "Invalid vendor type." });
    }

    await vendor.save();
    return res.status(200).json({
      message: "Onboarding completed successfully.",
      vendor,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Onboarding failed.", error: error.message });
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
      message: "Login Succesfully!",
      user,
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

    const user = await User.findOne({ email });

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
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "User already verified." });
    }

    await otpService.sendAndSaveOTP(email);
    return res.status(200).json({ message: "OTP resent successfully." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
};

export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const role = vendor ? "vendor" : "user";

    const resetToken = crypto.randomBytes(20).toString("hex");

    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save();

    await sendPasswordResetEmail(user.email, resetToken, role);

    return res.json({ message: "Password reset email sent" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const verifyVendorOTP = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const isOTPValid = await otpService.verifyOTP(email, otp);

    if (!isOTPValid) {
      return res.status(400).json({ message: "Invalid or expired OTP." });
    }

    const user = await Vendor.findOne({ email });

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

export const resendVendorOTP = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await Vendor.findOne({ email });
    console.log(user);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "User already verified." });
    }

    await otpService.sendAndSaveOTP(email);
    return res.status(200).json({ message: "OTP resent successfully." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
};

export const forgotVendorPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await Vendor.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const role = vendor ? "vendor" : "user";

    const resetToken = crypto.randomBytes(20).toString("hex");

    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save();

    await sendPasswordResetEmail(user.email, resetToken, role);

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
