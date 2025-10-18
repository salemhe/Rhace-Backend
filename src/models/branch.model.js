import mongoose from "mongoose";
import bcrypt from "bcrypt";

const branchSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  phone: { type: String, required: true },
  operatingDays: { type: [String], required: true },
  operatingHours: {
    from: { type: String, required: true },
    to: { type: String, required: true },
  },
  capacity: { type: Number, default: 0 }, // Overall guest capacity for the branch
  minLeadTimeHours: { type: Number, default: 0 }, // Minimum lead time to book in hours
  cutOffTimeMinutes: { type: Number, default: 0 }, // Cut-off time in minutes before closing for same-day bookings
  manager: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  branchType: { type: String, enum: ["Hotel", "Restaurant", "Club"], required: true },
  status: { type: String, enum: ["Opened", "Closed"], default: "Opened" },
});

branchSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

branchSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

const Branch = mongoose.model("Branch", branchSchema);

export default Branch;
