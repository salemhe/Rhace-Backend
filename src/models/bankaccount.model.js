import { Schema, model } from "mongoose";

const BankAccountSchema = new Schema(
  {
    vendor: {
      type: Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    accountName: {
      type: String,
      required: true,
    },
    accountNumber: {
      type: String,
      required: true,
    },
    bankCode: {
      type: String,
      required: true,
    },
    bankName: {
      type: String,
      required: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationDate: {
      type: Date,
    },
    maskedAccountNumber: {
      type: String,
    },
  },
  { timestamps: true }
);

// Pre-save hook to mask account number
BankAccountSchema.pre("save", function (next) {
  if (this.accountNumber && this.accountNumber.length > 4) {
    const lastFour = this.accountNumber.slice(-4);
    this.maskedAccountNumber = `****${lastFour}`;
  }
  next();
});

export default model("BankAccount", BankAccountSchema);
