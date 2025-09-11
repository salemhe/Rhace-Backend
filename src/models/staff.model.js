import mongoose from "mongoose";

const staffSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  photo: { type: String },
  staffId: { type: String, required: true, unique: true },
  jobTitle: { type: String },
  branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true },
  role: { type: String, required: true }, // Consider a separate Role model for more complex RBAC
  // For custom permissions
  permissions: {
    type: Map,
    of: Boolean,
  },
  status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
});

const Staff = mongoose.model("Staff", staffSchema);

export default Staff;
