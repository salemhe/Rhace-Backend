import { Schema, model } from "mongoose";

const popularSearchSchema = new Schema(
  {
    word: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["hotel", "restaurant", "club", "general"],
    },
    vendors: [
      {
        id: {
            type: Schema.Types.ObjectId,
            ref: "Vendor",
        },
        name: String,
      },
    ],
    totalSearches: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export default model("PopularSearch", popularSearchSchema);
