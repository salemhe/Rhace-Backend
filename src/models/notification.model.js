import { Schema, model } from "mongoose";

const NotificationSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["read", "unread"],
      default: "unread",
    },
    type: {
      type: String,
      enum: ["RESERVATION", "PAYMENT", "SECURITY", "GENERAL", "VENDOR"],
      required: true,
    },
    link: {
      type: String,
    },
  },
  { timestamps: true }
);

export default model("Notification", NotificationSchema);
