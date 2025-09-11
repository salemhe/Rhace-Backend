import mongoose from "mongoose";

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
  manager: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  status: { type: String, enum: ["Opened", "Closed"], default: "Opened" },
});

const Branch = mongoose.model("Branch", branchSchema);

export default Branch;
