// import mongoose from "mongoose";
// import bcrypt from "bcrypt";

// const userSchema = new mongoose.Schema({
//   name: {
//     type: String,
//     required: true,
//   },
//   email: {
//     type: String,
//     required: true,
//     unique: true,
//   },
//   password: {
//     type: String,
//     required: true,
//   },
//   role: {
//     type: String,
//     enum: ["admin", "manager", "staff", "guest"],
//     default: "guest",
//   },
//   isVerified: { // New field for OTP verification
//     type: Boolean,
//     default: false,
//   },
//   vendorType: { // New field for vendor type (Hotel, Restaurant, Club)
//     type: String,
//     enum: ["Hotel", "Restaurant", "Club", null], // Allow null initially
//     default: null,
//   },
//   resetPasswordToken: {
//     type: String,
//   },
//   resetPasswordExpires: {
//     type: Date,
//   },
//   branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" }, // Associate user with a branch for branch-specific access
//   permissions: [{ type: String }], // Custom permissions array, e.g., ["create_booking", "view_reports"]
// });

// userSchema.pre("save", async function (next) {
//   if (!this.isModified("password")) {
//     return next();
//   }
//   const salt = await bcrypt.genSalt(10);
//   this.password = await bcrypt.hash(this.password, salt);
//   next();
// });

// userSchema.methods.comparePassword = async function (password) {
//   return await bcrypt.compare(password, this.password);
// };

// const User = mongoose.model("User", userSchema);

// export default User;

// api/models/User.js

import { Schema, model } from "mongoose";

const UserSchema = new Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    isVerified: { type: Boolean, default: false },
    isOnboarded: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true } 
);

UserSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});


export default model("User", UserSchema);
