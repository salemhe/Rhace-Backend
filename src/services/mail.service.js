import nodemailer from "nodemailer";

import sgMail from "@sendgrid/mail";

// Generic email sending function
export const sendEmail = async (to, subject, htmlContent) => {
  try {
    console.log(
      "SendGrid API Key:",
      process.env.SENDGRID_API_KEY ? "FOUND" : "NOT FOUND"
    );
    console.log("SMTP_USER:", process.env.SMTP_USER);

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    const msg = {
      to,
      from: process.env.SMTP_USER,
      subject,
      html: htmlContent,
    };
    await sgMail.send(msg);
  } catch (error) {
    console.error(error);

    if (error.response) {
      console.error(error.response.body);
    }
  }
};

export const sendPasswordResetEmail = async (to, token, role) => {
  const resetUrl = `http://localhost:3000/auth/${role}/reset-password?token=${token}`;

  const htmlContent = `
    <p>You are receiving this email because you (or someone else) have requested the reset of the password for your account.</p>
    <p>Please click on the following link, or paste this into your browser to complete the process:</p>
    <a href="${resetUrl}">${resetUrl}</a>
    <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
  `;
  await sendEmail(to, "Password Reset", htmlContent);
};

export const sendBookingConfirmationEmail = async (to, bookingDetails) => {
  const {
    bookingCode,
    hotelName,
    roomType,
    checkInDate,
    checkOutDate,
    totalAmount,
    currency,
  } = bookingDetails;
  const htmlContent = `
    <p>Dear ${to},</p>
    <p>Your booking has been confirmed!</p>
    <p><strong>Booking Code:</strong> ${bookingCode}</p>
    <p><strong>Hotel:</strong> ${hotelName}</p>
    <p><strong>Room Type:</strong> ${roomType}</p>
    <p><strong>Check-in Date:</strong> ${new Date(
      checkInDate
    ).toDateString()}</p>
    <p><strong>Check-out Date:</strong> ${new Date(
      checkOutDate
    ).toDateString()}</p>
    <p><strong>Total Amount:</strong> ${totalAmount} ${currency}</p>
    <p>Thank you for your booking!</p>
  `;
  await sendEmail(to, "Booking Confirmation", htmlContent);
};

export const sendBookingCancellationEmail = async (to, bookingDetails) => {
  const { bookingCode, hotelName, checkInDate, checkOutDate } = bookingDetails;
  const htmlContent = `
    <p>Dear ${to},</p>
    <p>Your booking has been cancelled.</p>
    <p><strong>Booking Code:</strong> ${bookingCode}</p>
    <p><strong>Hotel:</strong> ${hotelName}</p>
    <p><strong>Check-in Date:</strong> ${new Date(
      checkInDate
    ).toDateString()}</p>
    <p><strong>Check-out Date:</strong> ${new Date(
      checkOutDate
    ).toDateString()}</p>
    <p>If you have any questions, please contact us.</p>
  `;
  await sendEmail(to, "Booking Cancellation", htmlContent);
};

export const sendPaymentReceiptEmail = async (to, paymentDetails) => {
  const { bookingCode, amount, currency, method, providerRef } = paymentDetails;
  const htmlContent = `
    <p>Dear ${to},</p>
    <p>Thank you for your payment!</p>
    <p><strong>Booking Code:</strong> ${bookingCode}</p>
    <p><strong>Amount Paid:</strong> ${amount} ${currency}</p>
    <p><strong>Payment Method:</strong> ${method}</p>
    <p><strong>Transaction ID:</strong> ${providerRef}</p>
    <p>Your payment has been successfully processed.</p>
  `;
  await sendEmail(to, "Payment Receipt", htmlContent);
};
