import crypto from "crypto";
import { Booking } from "../models/booking.model.js";
import Payment from "../models/payment.model.js";
import { createReservationFromPayment } from "./booking.controller.js";
import { sendBookingConfirmationEmail } from "../services/mail.service.js";
import { getVendorSocket } from "../websockets/socketManager.js";
import { emitPaymentUpdate } from "./payment.controller.js";
import { Vendor } from "../models/vendor.model.js";

export const handlePaystack = async (req, res) => {
  console.log('Webhook hit:', req.body); // Missing this log?
  try {
    const hash = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      console.error("Invalid webhook signature");
      return res.status(401).send("Invalid signature");
    }

    const event = req.body;
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
    });

    let isNewReservation = false;

    if (!reservation) {
      reservation = await createReservationFromPayment(payment);
      const vendor = await Vendor.findOne({ _id: reservation.vendor._id });
      if (payment.isSplitPayment && !payment.booked) {
        vendor.balance += payment.amountPaid;
      }
      await vendor.save();
      isNewReservation = true;
    } else {
      console.log("⏭️  Reservation already exists:", reservation.resId);
    }

        // ✅ Update payment status first
        await Payment.updateOne(
          { _id: paymentId },
          {
            status: "success",
            booked: true,
            webhookProcessed: true,
            webhookProcessedAt: new Date(),
            webhookAttempts: payment.webhookAttempts + 1 || 1,
            paystackData: data,
            paidAt: data.paid_at,
            reservationId: reservation._id,
            paymentMethod: data.channel,
          },
        );

        // ✅ TASK 1: Update ALL matching reservations paymentStatus = "paid"
        // Handle both main Booking model AND dashboard Reservation model
        const [mainBookingsUpdated, dashboardReservationsUpdated] = await Promise.all([
          Booking.updateMany(
            { resId: payment.booking }, // Match by booking resId
            { $set: { paymentStatus: "paid" } }
          ),
          Reservation.updateMany( // Dashboard reservations
            { payment: paymentId }, // Match by payment reference
            { $set: { paymentStatus: "paid" } }
          )
        ]);

        console.log(`✅ Updated ${mainBookingsUpdated.modifiedCount} main bookings + ${dashboardReservationsUpdated.modifiedCount} dashboard reservations to "paid"`);

    // 🆕 FIX: Create PaymentTransaction for hotel dashboard compatibility
    if (payment.metadata?.reservationType === "hotel" && reservation._id) {
      const PaymentTransaction = require("../models/paymenttransaction.model.js").default;
      
      const existingPT = await PaymentTransaction.findOne({
        booking: reservation._id,
        paystackReference: paymentId
      });

      if (!existingPT) {
        await PaymentTransaction.create([{
          booking: reservation._id,
          vendor: reservation.vendor,
          amount: payment.amount,
          status: "succeeded",  // Matches dashboard.controller.js query
          paystackReference: paymentId,
          paymentMethod: data.channel,
          paidAt: data.paid_at,
          metadata: {
            paystackData: data,
            source: "paystack_webhook"
          }
        }]);
        console.log("✅ Created PaymentTransaction for hotel:", reservation._id);
      } else {
        console.log("ℹ️ PaymentTransaction already exists:", existingPT._id);
      }
    }

    const populate = reservation.reservationType === "restaurantReservation" ?
     "menus.menu" : reservation.reservationType === "hotelReservation" ?
     "room" : "drinks.drink combos table";

    
    await reservation.populate(`vendor ${populate}`);

    if (isNewReservation) {
      sendBookingConfirmationEmail(
        reservation.customerEmail,
        reservation,
        payment.metadata.reservationType,
      ).catch((err) => console.error("Email failed:", err));

      // emitPaymentUpdate(payment.metadata.bookingId, "paid");

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

    // ✅ Emit realtime update
    emitPaymentUpdate(metadata.bookingId, "failed");

    console.log("✅ Paystack webhook processed:", paymentId);
  } catch (error) {
    console.error("Error handling failed payment:", error);
  }
}
