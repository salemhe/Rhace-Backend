import OTP from "../models/otp.model.js";
import { sendEmail } from "./mail.service.js";

const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
};

export const sendAndSaveOTP = async (email) => {
    const otpCode = generateOTP();
    await OTP.create({ email, otp: otpCode });
    await sendEmail(email, "Your OTP for Rhace-Backend", `<p>Your One-Time Password (OTP) is: <strong>${otpCode}</strong>. It is valid for 5 minutes.</p>`);
    return otpCode;
};

export const verifyOTP = async (email, otp) => {
    const otpRecord = await OTP.findOne({ email, otp });
    if (!otpRecord) {
        return false; // OTP not found or expired
    }
    // OTP found and not expired (due to 'expires' property in schema)
    await OTP.deleteOne({ email }); // Delete OTP after successful verification
    return true;
};

