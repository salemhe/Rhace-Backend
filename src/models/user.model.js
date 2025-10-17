import { Schema, model } from "mongoose";
import bcrypt from "bcrypt";

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
    isVIP: { type: Boolean, default: false },
    role: {
      type: String,
      enum: ["superadmin", "finance", "ops", "support", "manager", "staff", "guest"],
      default: "guest",
    },
    permissions: [{ type: String }], // Custom permissions array
    branch: { type: Schema.Types.ObjectId, ref: "Branch" },
    lastActive: { type: Date },
    status: { type: String, enum: ["active", "pending", "suspended"], default: "active" },
    twoFactorSecret: { type: String }, // For 2FA
    twoFactorEnabled: { type: Boolean, default: false },
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
