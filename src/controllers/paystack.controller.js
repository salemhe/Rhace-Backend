import crypto from "crypto";
import { Booking } from "../models/booking.model.js";
import Payment from "../models/payment.model.js";
import { Vendor } from "../models/vendor.model.js";
import { getVendorSocket } from "../websockets/socketManager.js";
import { emitPaymentUpdate } from "./payment.controller.js";

export const handlePaystack = async (req, res) => {
  res.sendStatus(200);

  try {
    const signature = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(req.body)
      .digest("hex");

    if (signature !== req.headers["x-paystack-signature"]) {
      console.error("❌ Invalid Paystack signature");
      return;
    }

    const event = JSON.parse(req.body.toString());
    console.log(event);

    if (event.event !== "charge.success") return;

    const data = event.data;
    const reference = data.reference;
    const metadata = data.metadata || {};

    const existingTransaction = await Payment.findOne({
      reference,
      status: { $in: ["Paid", "Part-paid"] },
    });
    if (existingTransaction) return;

    const amountPaid = data.amount / 100;
    const amount = data.amount * 0.0092;
    const isSplitPayment = !!data.split;

    const payment = new Payment({
      reference,
      email: metadata.email,
      customerName: metadata.customerName,

      user: metadata.userId,
      vendor: metadata.vendorId,
      booking: metadata.bookingId,

      paymentMethod: data.channel,
      currency: data.currency,

      amount,
      amountPaid,

      status: "Paid",
      paidAt: data.paid_at,

      isSplitPayment,
      splitData: data.split || null,

      gatewayResponse: data,
    });

    const booking = await Booking.findById(metadata.bookingId)
      .populate({
        path: "vendor",
      })
      .populate({
        path: "room",
      })
      .populate({
        path: "drinks.drink",
      });
    if (booking) {
      if (booking.paymentStatus === "Part Paid") {
        payment.status = "Part-paid";
      }
      booking.paymentStatus = !booking.payLater ? data.status : "Not Paid";
      booking.paidFor = true;
      await booking.save();
    }

    await payment.save();

    const vendorSocket = getVendorSocket(metadata.vendorId);
    if (vendorSocket && vendorSocket.readyState === 1) {
      vendorSocket.send(
        JSON.stringify({
          type: "new_reservation",
          data: {
            ...booking,
            message: "You have a new reservation",
          },
        })
      );
      console.log("Reservation sent to vendor via WebSocket.");
    }

    const reservation = await Booking.findOne({ bookingCode: booking.bookingCode })
      .populate({ path: "menus.menu" })
      .populate({ path: "vendor" })
      .populate({ path: "room" })
      .populate({ path: "drinks.drink" })
      .populate({ path: "combos" });

    await sendBookingConfirmationEmail(
      reservation.customerEmail,
      reservation,
      reservation.reservationType
    );

    if (!isSplitPayment && metadata.vendorId) {
      await Vendor.findByIdAndUpdate(metadata.vendorId, {
        $inc: { balance: amountPaid },
      });
    }

    // ✅ Emit realtime update
    emitPaymentUpdate(metadata.bookingId, 'paid');

    console.log("✅ Paystack webhook processed:", reference);
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
  }
};
