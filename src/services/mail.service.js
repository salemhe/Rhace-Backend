// import nodemailer from "nodemailer";

// import sgMail from "@sendgrid/mail";

// // Generic email sending function
// export const sendEmail = async (to, subject, htmlContent) => {
//   try {
//     console.log(
//       "SendGrid API Key:",
//       process.env.SENDGRID_API_KEY ? "FOUND" : "NOT FOUND"
//     );
//     console.log("SMTP_USER:", process.env.SMTP_USER);

//     sgMail.setApiKey(process.env.SENDGRID_API_KEY);
//     const msg = {
//       to,
//       from: process.env.SMTP_USER,
//       subject,
//       html: htmlContent,
//     };
//     await sgMail.send(msg);
//   } catch (error) {
//     console.error(error);

//     if (error.response) {
//       console.error(error.response.body);
//     }
//   }
// };

// export const sendPasswordResetEmail = async (to, token, role) => {
//   const resetUrl = `https://rhace-frontend.vercel.app/auth/${role}/reset-password?token=${token}`;

//   const htmlContent = `
//     <p>You are receiving this email because you (or someone else) have requested the reset of the password for your account.</p>
//     <p>Please click on the following link, or paste this into your browser to complete the process:</p>
//     <a href="${resetUrl}">${resetUrl}</a>
//     <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
//   `;
//   await sendEmail(to, "Password Reset", htmlContent);
// };

// export const sendBookingConfirmationEmail = async (to, bookingDetails) => {
//   const {
//     bookingCode,
//     hotelName,
//     roomType,
//     checkInDate,
//     checkOutDate,
//     totalAmount,
//     currency,
//   } = bookingDetails;
//   const htmlContent = `
//     <p>Dear ${to},</p>
//     <p>Your booking has been confirmed!</p>
//     <p><strong>Booking Code:</strong> ${bookingCode}</p>
//     <p><strong>Hotel:</strong> ${hotelName}</p>
//     <p><strong>Room Type:</strong> ${roomType}</p>
//     <p><strong>Check-in Date:</strong> ${new Date(
//       checkInDate
//     ).toDateString()}</p>
//     <p><strong>Check-out Date:</strong> ${new Date(
//       checkOutDate
//     ).toDateString()}</p>
//     <p><strong>Total Amount:</strong> ${totalAmount} ${currency}</p>
//     <p>Thank you for your booking!</p>
//   `;
//   await sendEmail(to, "Booking Confirmation", htmlContent);
// };

// export const sendBookingCancellationEmail = async (to, bookingDetails) => {
//   const { bookingCode, hotelName, checkInDate, checkOutDate } = bookingDetails;
//   const htmlContent = `
//     <p>Dear ${to},</p>
//     <p>Your booking has been cancelled.</p>
//     <p><strong>Booking Code:</strong> ${bookingCode}</p>
//     <p><strong>Hotel:</strong> ${hotelName}</p>
//     <p><strong>Check-in Date:</strong> ${new Date(
//       checkInDate
//     ).toDateString()}</p>
//     <p><strong>Check-out Date:</strong> ${new Date(
//       checkOutDate
//     ).toDateString()}</p>
//     <p>If you have any questions, please contact us.</p>
//   `;
//   await sendEmail(to, "Booking Cancellation", htmlContent);
// };

// export const sendPaymentReceiptEmail = async (to, paymentDetails) => {
//   const { bookingCode, amount, currency, method, providerRef } = paymentDetails;
//   const htmlContent = `
//     <p>Dear ${to},</p>
//     <p>Thank you for your payment!</p>
//     <p><strong>Booking Code:</strong> ${bookingCode}</p>
//     <p><strong>Amount Paid:</strong> ${amount} ${currency}</p>
//     <p><strong>Payment Method:</strong> ${method}</p>
//     <p><strong>Transaction ID:</strong> ${providerRef}</p>
//     <p>Your payment has been successfully processed.</p>
//   `;
//   await sendEmail(to, "Payment Receipt", htmlContent);
// };


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

// PASSWORD RESET EMAIL
export const sendPasswordResetEmail = async (to, token, role) => {
  const resetUrl = `https://www.rhace.co/auth/${role}/reset-password?token=${token}`;
  const htmlContent = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Password Reset - Rhace</title>
    <style>
      body { font-family: "Inter", Arial, sans-serif; background-color: #f4f5f7; margin: 0; padding: 0; color: #333; }
      .container { max-width: 500px; margin: 40px auto; background: #f7f8fa; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08); overflow: hidden; }
      .header { background: #f7f8fa; padding: 30px; text-align: left; }
      .header img { width: 130px; height: auto; }
      .content { padding: 40px 30px; text-align: center; }
      .content h2 { color: #0d0d0d; font-size: 22px; font-weight: 700; margin-bottom: 15px; }
      .content p { color: #555; line-height: 1.6; font-size: 15px; margin: 15px 0; }
      .btn { display: inline-block; background: #0b544b; color: #fff; padding: 18px 26px; text-decoration: none; font-weight: 700; font-size: 18px; letter-spacing: 1px; margin: 25px 0; transition: background 0.3s ease; cursor: pointer }
      .btn:hover { background: #09473e; }
      .footer { background: #f7f8fa; text-align: center; padding: 18px; font-size: 13px; color: #888; border-top: 1px solid #eee; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <img src="https://www.rhace.co/assets/Rhace-11-DtGOoxzF.png" alt="Rhace Logo" />
      </div>
      <div class="content">
        <h2>Password Reset Request</h2>
        <p>Hello ${to},</p>
        <p>We received a request to reset your password. Click the button below to securely create a new one.</p>
        <a href="${resetUrl}" class="btn">Reset Password</a>
        <p>If you didn’t request this, please ignore this email — your password will remain unchanged.</p>
        <p style="margin-top: 30px;">Warm regards,<br><strong>The Rhace Team</strong></p>
      </div>
      <div class="footer">© 2025 Rhace. All rights reserved.</div>
    </div>
  </body>
  </html>`;
  await sendEmail(to, "Password Reset", htmlContent);
};

//  BOOKING CONFIRMATION EMAIL
export const sendBookingConfirmationEmail = async (to, bookingDetails, type) => {
  const {
    _id,
    bookingCode,
    location,
    date,
    time,
    guests,
    mealPreselected,
    menus,
    drinks,
    table,
    combos,
    room,
    checkInDate,
    checkOutDate,
    totalAmount,
    currency = "Naira",
    specialOccasion,
    seatingPreference,
    vendor,
    specialRequest,
    partPaid,
    payLater, 
    customerName,
  } = bookingDetails;

  // Generate QR code URL
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
    `https://www.rhace.co/bookings/${_id}`
  )}&size=150x150`;

  // Build details dynamically
  let detailsHtml = `
  <p><strong>Booking Code:</strong> ${bookingCode}</p>`;
  
  if (type === "hotel") {
    detailsHtml += `
      <p><strong>Hotel name:</strong> ${vendor.businessName}</p>
      <p><strong>Location:</strong> ${location}</p>
      <p><strong>Room:</strong> ${room?.name || "N/A"}</p>
      <p><strong>Check-in:</strong> ${new Date(checkInDate).toDateString()}</p>
      <p><strong>Check-out:</strong> ${new Date(checkOutDate).toDateString()}</p>
      <p><strong>Guests:</strong> ${guests}</p>
      <p><strong>Payment Status:</strong> ${partPaid ? "Part Paid" : "Paid"}</p>
      ${specialRequest ? `<p><strong>Special Request:</strong> ${specialRequest}</p>` : ""}
      <p><strong>Total Amount:</strong> ${totalAmount.toLocaleString()} ${currency}</p>
    `;
  } else if (type === "restaurant") {
    detailsHtml += `
      <p><strong>Restaurant Name:</strong> ${vendor.businessName}</p>
      <p><strong>Location:</strong> ${location}</p>
      <p><strong>Date:</strong> ${new Date(date).toDateString()}</p>
      <p><strong>Time:</strong> ${time}</p>
      <p><strong>Guests:</strong> ${guests}</p>
      <p><strong>Meal Preselected:</strong> ${mealPreselected ? "Yes" : "No"}</p>
      <p><strong>Payment Status:</strong> ${payLater ? "Pay at Restaurant" : "Paid"}</p>
      ${menus?.length ? `<p><strong>Menus:</strong> ${menus.map(m => m.menu?.name || "N/A").join(", ")}</p>` : ""}
      ${specialOccasion ? `<p><strong>Special Occasion:</strong> ${specialOccasion}</p>` : ""}
      ${seatingPreference ? `<p><strong>Seating Preference:</strong> ${seatingPreference}</p>` : ""}
      ${specialRequest ? `<p><strong>Special Request:</strong> ${specialRequest}</p>` : ""}
      <p><strong>Total Amount:</strong> ${totalAmount.toLocaleString()} ${currency}</p>
    `;
  } else if (type === "club") {
    detailsHtml += `
      <p><strong>Club name:</strong> ${vendor.businessName}</p>
      <p><strong>Location:</strong> ${location}</p>
      <p><strong>Date:</strong> ${new Date(date).toDateString()}</p>
      <p><strong>Time:</strong> ${time}</p>
      <p><strong>Guests:</strong> ${guests}</p>
      <p><strong>Payment Status:</strong> ${partPaid ? "Part Paid" : "Paid"}</p>
      ${table ? `<p><strong>Table:</strong> ${table}</p>` : ""}
      ${drinks?.length ? `<p><strong>Drinks:</strong> ${drinks.map(d => `${d.drink?.name || "N/A"} (x${d.quantity})`).join(", ")}</p>` : ""}
      ${combos?.length ? `<p><strong>Combos:</strong> ${combos.map(c => c?.name || "N/A").join(", ")}</p>` : ""}
      ${specialRequest ? `<p><strong>Special Request:</strong> ${specialRequest}</p>` : ""}
      <p><strong>Total Amount:</strong> ${totalAmount.toLocaleString()} ${currency}</p>
    `;
  }

  const htmlContent = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Booking Confirmation</title>
    <style>
      body { font-family: "Inter", Arial, sans-serif; background-color: #f4f5f7; margin: 0; padding: 0; color: #333; }
      .container { max-width: 500px; margin: 40px auto; box-shadow: 0 10px 30px rgba(0,0,0,0.08); overflow: hidden; }
      .header { background: #0b544b; padding: 30px; text-align: left; }
      .header img { width: 130px; height: auto; max-width: 100%; }
      .content { padding: 40px 30px; text-align: left; background: #fff; }
      .content h2 { color: #0d0d0d; font-size: 22px; font-weight: 700; margin-bottom: 15px; }
      .content p { font-size: 15px; color: #333; line-height: 1.6; }
      .details { margin: 25px 0; padding: 15px 20px; background: #f9fafb; border-radius: 6px; border: 1px solid #eee; }
      .details p { font-size: 15px; color: #555; margin: 8px 0; }
      .qr-section { text-align: center; margin-top: 30px; }
      .qr-section img { width: 150px; height: 150px; border-radius: 8px; }
      .footer { background: #f7f8fa; text-align: center; padding: 18px; font-size: 13px; color: #888; border-top: 1px solid #eee; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <img src="https://www.rhace.co/assets/Rhace-09-Cqm7n3Fw.png" alt="Rhace Logo" />
      </div>
      <div class="content">
        <h2>Your Booking is Confirmed 🎉</h2>
        <p>Dear ${customerName},</p>
        <p>Your booking has been successfully confirmed. Here are the details:</p>
        <div class="details">${detailsHtml}</div>
        <div class="qr-section">
          <p>Scan this QR code to view your booking details:</p>
          <img src="${qrCodeUrl}" alt="Booking QR Code" />
        </div>
        <p>If you need to make any updates or have special requests, reply to this email or contact us through your Rhace account.</p>
        <p>Thank you for choosing <strong>Rhace</strong>!</p>
        <p style="margin-top: 25px;">Warm regards,<br><strong>The Rhace Team</strong></p>
      </div>
      <div class="footer">© 2025 Rhace. All rights reserved.</div>
    </div>
  </body>
  </html>
  `;

  await sendEmail(to, "Booking Confirmation", htmlContent);
};


//  BOOKING CANCELLATION EMAIL
export const sendBookingCancellationEmail = async (to, bookingDetails) => {
  const { bookingCode, hotelName, checkInDate, checkOutDate } = bookingDetails;
  const htmlContent = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Booking Cancellation</title>
    <style>
      body { font-family: "Inter", Arial, sans-serif; background-color: #f4f5f7; margin: 0; padding: 0; color: #333; }
      .container { max-width: 500px; margin: 40px auto; box-shadow: 0 10px 30px rgba(0,0,0,0.08); overflow: hidden; }
      .header { background: #0b544b; padding: 30px; text-align: left; }
      .header img { width: 130px; height: auto; max-width: 100%; }
      .content { padding: 40px 30px; text-align: left; background: #fff; }
      .content h2 { font-size: 22px; font-weight: 700; margin-bottom: 15px; }
      .content p { font-size: 15px; color: #444; line-height: 1.6; }
      .details { margin: 25px 0; padding: 15px 20px; background: #f9fafb; border-radius: 6px; border: 1px solid #eee; }
      .details p { font-size: 15px; color: #555; margin: 8px 0; }
      .footer { background: #f7f8fa; text-align: center; padding: 18px; font-size: 13px; color: #888; border-top: 1px solid #eee; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <img src="https://www.rhace.co/assets/Rhace-09-Cqm7n3Fw.png" alt="Rhace Logo" />
      </div>
      <div class="content">
        <h2><b>Booking Cancelled</b> 😲</h2>
        <p>Dear ${to},</p>
        <p>We’re sorry to inform you that your booking has been successfully cancelled. Below are the details for your reference.</p>
        <div class="details">
          <p><strong>Booking Code:</strong> ${bookingCode}</p>
          <p><strong>Hotel:</strong> ${hotelName}</p>
          ${type === "hotel" ? (
            `
            <p><strong>Check-in:</strong> ${new Date(checkInDate).toDateString()}</p>
            <p><strong>Check-out:</strong> ${new Date(checkOutDate).toDateString()}</p>
            `
          ) : (
            `
            <p><strong>Date:</strong> ${new Date(date).toDateString()}</p>
            `
          )}
        </div>
        <p>If this was an error or you'd like to make a new booking, please visit your Rhace account or contact our support team.</p>
        <p>Thank you for considering <strong>Rhace</strong> — we hope to host you soon.</p>
        <p style="margin-top: 25px;">Warm regards,<br><strong>The Rhace Team</strong></p>
      </div>
      <div class="footer">© 2025 Rhace. All rights reserved.</div>
    </div>
  </body>
  </html>`;
  await sendEmail(to, "Booking Cancellation", htmlContent);
};

//  PAYMENT RECEIPT EMAIL
export const sendPaymentReceiptEmail = async (to, paymentDetails) => {
  const { bookingCode, amount, currency, method, providerRef } = paymentDetails;
  const htmlContent = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Payment Receipt</title>
    <style>
      body { font-family: "Inter", Arial, sans-serif; background-color: #f4f5f7; margin: 0; padding: 0; color: #333; }
      .container { max-width: 520px; margin: 50px auto; background: #ffffff; overflow: hidden; box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08); }
      .header { background: linear-gradient(135deg, #f7f8fa, #ffffff); border-bottom: 1px solid #eee; padding: 25px 30px; display: flex; align-items: center; justify-content: space-between; }
      .header img { width: 120px; height: auto; }
      .receipt-title { text-align: right; color: #0d0d0d; font-size: 18px; font-weight: 600; }
      .content { padding: 35px 30px; text-align: left; }
      .content h2 { font-size: 22px; font-weight: 700; margin-bottom: 10px; }
      .content p { font-size: 15px; color: #444; line-height: 1.6; }
      .summary-box { background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; padding: 20px; margin-top: 25px; }
      .summary-row { display: flex; justify-content: space-between; margin: 8px 0; font-size: 15px; color: #555; }
      .summary-row strong { color: #0d0d0d; font-weight: 600; }
      .total { border-top: 1px solid #ddd; margin-top: 15px; padding-top: 10px; font-size: 16px; font-weight: 700; color: #0b544b; }
      .footer { text-align: center; background: #f7f8fa; padding: 20px; font-size: 13px; color: #888; border-top: 1px solid #eee; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <img src="https://www.rhace.co/assets/Rhace-11-DtGOoxzF.png" alt="Rhace Logo" />
        <div class="receipt-title">Payment Receipt</div>
      </div>
      <div class="content">
        <h2>Thank you, ${to}!</h2>
        <p>Your payment has been successfully processed. Below is your payment summary.</p>
        <div class="summary-box">
          <div class="summary-row"><span>Booking Code</span><strong>${bookingCode}</strong></div>
          <div class="summary-row"><span>Amount Paid</span><strong>${amount} ${currency}</strong></div>
          <div class="summary-row"><span>Payment Method</span><strong>${method}</strong></div>
          <div class="summary-row"><span>Transaction ID</span><strong>${providerRef}</strong></div>
          <div class="total">Total Paid: ${amount} ${currency}</div>
        </div>
        <p style="margin-top: 25px;">We’re grateful for your trust in <strong>Rhace</strong>. Your booking is now confirmed.</p>
        <p style="margin-top: 25px;">Warm regards,<br><strong>The Rhace Team</strong></p>
      </div>
      <div class="footer">© 2025 Rhace. All rights reserved.</div>
    </div>
  </body>
  </html>`;
  await sendEmail(to, "Payment Receipt", htmlContent);
};
