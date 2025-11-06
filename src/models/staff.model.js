import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import bcrypt from "bcrypt";

const staffSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  photo: { type: String },
  staffId: { type: String, required: true, unique: true },
  jobTitle: { type: String },
  role: { type: String, required: true }, // Consider a separate Role model for more complex RBAC
  // For custom permissions
  permissions: {
    type: Map,
    of: Boolean,
  },
  status: { type: String, enum: ["active", "inactive"], default: "active" },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
}, {
  timestamps: true
});

staffSchema.plugin(mongoosePaginate);

const Staff = mongoose.model("Staff", staffSchema);

export default Staff;
