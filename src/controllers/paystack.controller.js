import crypto from "crypto";
import { Booking } from "../models/booking.model.js";
import Payment from "../models/payment.model.js";
import { createReservationFromPayment } from "./booking.controller.js";
import { sendBookingConfirmationEmail } from "../services/mail.service.js";
import { getVendorSocket } from "../websockets/socketManager.js";
import mongoose from "mongoose";

export const handlePaystack = async (req, res) => {
  try {
    const hash = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(req.body)
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      console.error("Invalid webhook signature");
      return res.status(401).send("Invalid signature");
    }

    const event = JSON.parse(req.body);
    console.log("✅ Webhook received:", event.event);

    if (event.event === "charge.success") {
      await handleSuccessfulPayment(event.data);
    }

    if (event.event === "charge.failed") {
      await handleFailedPayment(event.data);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error);
    res.sendStatus(500);
  }
};

async function handleSuccessfulPayment(data) {
  const paymentId = data.reference;

  try {
    const payment = await Payment.findById(paymentId);

    if (!payment) {
      console.error("❌ Payment not found:", paymentId);
      return;
    }

    if (payment.webhookProcessed) {
      console.log("⏭️  Webhook already processed:", paymentId);
      return;
    }

    const paidAmount = data.amount / 100;
    if (paidAmount !== payment.amount) {
      console.error("❌ Amount mismatch:", {
        expected: payment.amount,
        received: paidAmount,
      });
      return;
    }

    let reservation = await Booking.findOne({
      resId: payment.booking,
    })

    if (!reservation) {
      reservation = await createReservationFromPayment(payment);
      const vendor = await Vendor.findOne({ _id: reservation.vendor._id });
      if (payment.isSplitPayment) {vendor.balance += payment.amountPaid }
      await vendor.save();
      isNewBooking = true;
    } else {
      console.log("⏭️  Reservation already exists:", reservation.resId);
    }

    await Payment.updateOne(
      { _id: paymentId },
      {
        status: "success",
        booked: true,
        webhookProcessed: true,
        webhookProcessedAt: new Date(),
        webhookAttempts: payment.webhookAttempts + 1,
        paystackData: data,
        paidAt: data.paid_at,
        reservationId: reservation._id,
        paymentMethod: data.channel,
      },
    );

    sendBookingConfirmationEmail(
      reservation.customerEmail,
      reservation,
      payment.metadata.reservationType,
    ).catch((err) => console.error("Email failed:", err));

    const vendorSocket = getVendorSocket(reservation.vendor._id);
    if (vendorSocket && vendorSocket.readyState === 1) {
      vendorSocket.send(
        JSON.stringify({
          type: "new_reservation",
          data: {
            ...reservation.toObject(),
            message: "You have a new reservation",
          },
        }),
      );
    }
  } catch (error) {
    console.error("Error processing webhook:", error);
    throw error;
  }
}

async function handleFailedPayment(data) {
  const paymentId = data.reference;

  try {
    await Payment.updateOne(
      { _id: paymentId },
      {
        status: "failed",
        failureReason: data.gateway_response,
        webhookProcessed: true,
        webhookProcessedAt: new Date(),
      },
    );

    console.log("❌ Payment failed:", paymentId, data.gateway_response);
  } catch (error) {
    console.error("Error handling failed payment:", error);
  }
}
