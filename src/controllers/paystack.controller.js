import crypto from "crypto";
import { Booking } from "../models/booking.model.js";
import Payment from "../models/payment.model.js";
import PaymentTransaction from "../models/paymenttransaction.model.js";
import Reservation from "../models/reservation.model.js";
import { createReservationFromPayment } from "./booking.controller.js";
import { sendBookingConfirmationEmail } from "../services/mail.service.js";
import { getVendorSocket } from "../websockets/socketManager.js";
import { emitPaymentUpdate } from "./payment.controller.js";
import { Vendor } from "../models/vendor.model.js";

export const handlePaystack = async (req, res) => {
  console.log('🔥 RAW BODY:', req.body);
  console.log('📧 Signature:', req.headers["x-paystack-signature"]);
  try {
    const hash = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(req.body)
      .digest("hex");

    console.log("🧪 Generated hash:", hash);
    console.log("🧪 Paystack hash:", req.headers["x-paystack-signature"]);

    if (hash !== req.headers["x-paystack-signature"]) {
      console.error("Invalid webhook signature");
      return res.status(401).send("Invalid signature");
    }

    const event = JSON.parse(req.body.toString());
    console.log("✅ WEBHOOK EVENT:", event.event);
    console.log("💰 PAYMENT DATA:", event.data?.reference, event.data?.status);

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

  console.log('🔍 Looking for payment with paystackReference:', paymentId);

  try {
    const payment = await Payment.findOne({ paystackReference: paymentId });

    if (!payment) {
      console.error("❌ PAYMENT NOT FOUND BY REFERENCE:", paymentId);
      console.log("Available paystackReferences in recent payments:");
      const recentPayments = await Payment.find({}).sort({ createdAt: -1 }).limit(5);
      recentPayments.forEach(p => console.log(`  ${p._id}: ${p.paystackReference}`));
      return;
    }

    console.log("✅ Found payment:", payment._id, "for reference:", paymentId);

    if (payment.webhookProcessed) {
      console.log("⏭️  Webhook already processed:", paymentId);
      return;
    }

    const paidAmount = data.amount / 100;
    if (Math.abs(paidAmount - payment.amount) > 0.01) {
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
      const vendor = await Vendor.findOne({ _id: reservation?.vendor?._id });
      if (vendor && payment.isSplitPayment && !payment.booked) {
        vendor.balance += payment.amountPaid;
        await vendor.save();
      }
      isNewReservation = true;
    } else {
      console.log("⏭️  Reservation already exists:", reservation.resId);
    }

    // ✅ Update payment status first using payment._id
    await Payment.updateOne(
      { _id: payment._id },
      {
        status: "success",
        booked: true,
        webhookProcessed: true,
        webhookProcessedAt: new Date(),
        webhookAttempts: payment.webhookAttempts + 1 || 1,
        paystackData: data,
        paidAt: data.paid_at,
        reservationId: reservation?._id,
        paymentMethod: data.channel,
      },
    );

        // ✅ TASK 1: Update ALL matching reservations paymentStatus = "paid"
        // Handle both main Booking model AND dashboard Reservation model
        // Update booking paymentStatus
        const mainBookingsUpdated = await Booking.updateMany(
          { resId: payment.booking },
          { $set: { paymentStatus: "paid" } }
        );

        console.log(`✅ Updated ${mainBookingsUpdated.modifiedCount} main bookings to "paid"`);

    // 🆕 Create PaymentTransaction for hotel dashboard (adjust fields to schema)
    if (payment.metadata?.reservationType === "hotel" && reservation?._id) {
      const existingPT = await PaymentTransaction.findOne({
        booking: reservation._id,
        providerRef: paymentId
      });

      if (!existingPT) {
        await PaymentTransaction.create({
          booking: reservation._id,
          vendor: reservation.vendor,
          amount: payment.amount,
          method: data.channel,
          providerRef: paymentId,
          status: "succeeded",
          metadata: {
            paystackData: data,
            source: "paystack_webhook"
          }
        });
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
    const payment = await Payment.findOne({ paystackReference: paymentId });
    if (!payment) {
      console.error("❌ PAYMENT NOT FOUND FOR FAILED WEBHOOK:", paymentId);
      return;
    }

    await Payment.updateOne(
      { _id: payment._id },
      {
        status: "failed",
        failureReason: data.gateway_response,
        webhookProcessed: true,
        webhookProcessedAt: new Date(),
      },
    );

    console.log("❌ Payment failed:", paymentId, data.gateway_response);

    // ✅ Emit realtime update
    emitPaymentUpdate(payment.metadata?.bookingId, "failed");

    console.log("✅ Failed webhook processed:", payment._id);
  } catch (error) {
    console.error("Error handling failed payment:", error);
  }
}
