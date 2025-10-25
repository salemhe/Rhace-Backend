// import OTP from "../models/otp.model.js";
// import { sendEmail } from "./mail.service.js";

// const generateOTP = () => {
//     return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
// };

// export const sendAndSaveOTP = async (email) => {
//     const otpCode = generateOTP();
//     await OTP.create({ email, otp: otpCode });
//     await sendEmail(email, "Your OTP for Rhace-Backend", `<p>Your One-Time Password (OTP) is: <strong>${otpCode}</strong>. It is valid for 5 minutes.</p>`);
//     return otpCode;
// };

// export const verifyOTP = async (email, otp) => {
//     const otpRecord = await OTP.findOne({ email, otp });
//     if (!otpRecord) {
//         return false; // OTP not found or expired
//     }
//     // OTP found and not expired (due to 'expires' property in schema)
//     await OTP.deleteOne({ email }); // Delete OTP after successful verification
//     return true;
// };



import OTP from "../models/otp.model.js";
import { sendEmail } from "./mail.service.js";


const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
};

export const sendAndSaveOTP = async (email) => {
  const otpCode = generateOTP();
  await OTP.create({ email, otp: otpCode });

  // --- Modern HTML Design ---
  const emailHtml = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Rhace Verification Code</title>
    <style>
      body {
        font-family: "Inter", Arial, sans-serif;
        background-color: #f4f5f7;
        margin: 0;
        padding: 0;
        color: #333;
      }

      .container {
        max-width: 500px;
        margin: 40px auto;
        background: #f7f8fa;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
        overflow: hidden;
      }

      .header {
        background: #f7f8fa;
        padding: 30px;
        text-align: left;
      }

      .header img {
        width: 120px;
        height: auto;
      }

      .content {
        padding: 40px 30px;
        text-align: center;
      }

      .content h2 {
        margin-top: 0;
        color: #0d0d0d;
        font-size: 22px;
        font-weight: 700;
      }

      .content p {
        color: #666;
        line-height: 1.6;
        font-size: 15px;
        margin: 15px 0;
      }

      .otp-box {
        display: inline-block;
        background: #075d78;
        color: #ffffff;
        font-size: 28px;
        font-weight: 700;
        letter-spacing: 10px;
        padding: 14px 26px;
        margin: 30px 0;
        box-shadow: 0 4px 10px rgba(0,0,0,0.1);
      }

      .footer {
        background: #f7f8fa;
        text-align: center;
        padding: 18px;
        font-size: 13px;
        color: #888;
        border-top: 1px solid #eee;
      }

      @media (max-width: 600px) {
        .container {
          margin: 20px;
        }

        .content {
          padding: 30px 20px;
        }

        .otp-box {
          font-size: 22px;
          letter-spacing: 8px;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <img src="/image/Rhace-11.png" alt="Rhace Logo">
      </div>
      <div class="content">
        <h2>Verify Your OTP Code</h2>
        <p>Hello 👋, thank you for joining <strong>Rhace</strong>!<br>
        Please use the OTP code below to verify your account.</p>

        <div class="otp-box">${otpCode}</div>

        <p>This code will expire in <strong>5 minutes</strong>.<br>
        If you didn’t request this, you can safely ignore this message.</p>
      </div>
      <div class="footer">
        © 2025 Rhace. All rights reserved.
      </div>
    </div>
  </body>
  </html>
  `;

  await sendEmail(
    email,
    "Your OTP for Rhace Verification",
    emailHtml
  );

  return otpCode;
};

export const verifyOTP = async (email, otp) => {
  const otpRecord = await OTP.findOne({ email, otp });
  if (!otpRecord) {
    return false; // OTP not found or expired
  }
  await OTP.deleteOne({ email }); // Delete OTP after successful verification
  return true;
};
