import { Booking, hotelReservation, restaurantReservation } from "../models/booking.model.js";
import { getVendorSocket } from "../websockets/socketManager.js";

export const createReservation = async (req, res) => {
  try {
    const {
      vendor,
      customerName,
      customerId,
      customerEmail,
      reservationType,
      location,
      totalAmount,
      image,
      date,
      time,
      guests,
      mealPreselected,
      menus,
      specialOccasion,
      seatingPreference,
      checkInDate,
      checkOutDate,
      specialRequest,
      room,
    } = req.body;

    console.log(req.body);
    if (!vendor || !reservationType || !location || !totalAmount) {
      return res.status(400).json({ message: "Fill required fields" });
    }

    const initialData = {
      customerName,
      customerId,
      customerEmail,
      vendor,
      reservationType: reservationType + "Reservation",
      reservationStatus: "Upcoming",
      location,
      totalAmount,
      paymentStatus: "Not Paid",
    };

    let reservationData = {};

    if (reservationType === "restaurant") {
      if (!image || !date || !time || !guests || !mealPreselected || !menus) {
        return res
          .status(400)
          .json({ message: "Fill restaurants required fields" });
      }

      const restaurant = await restaurantReservation.create({
        ...initialData,
        date,
        time,
        guests,
        mealPreselected,
        menus,
        specialOccasion,
        seatingPreference,
        specialRequest,
      });

      reservationData = restaurant;

      const vendorSocket = getVendorSocket(vendor);
      if (vendorSocket && vendorSocket.readyState === 1) {
        // 1 = OPEN
        vendorSocket.send(
          JSON.stringify({
            type: "new_reservation",
            data: {
              _id: restaurant._id,
              customerName,
              customerId,
              customerEmail,
              vendor,
              date,
              time,
              guests,
              reservationType: reservationType,
              reservationStatus: "Upcoming",
              location,
              totalAmount,
              paymentStatus: "Not Paid",
              message: "You have a new reservation",
            },
          })
        );
      }
    }

    if (reservationType === "hotel") {
      if (!checkInDate || !checkOutDate || !guests || !room) {
        return res.status(400).json({ message: "Fill hotels required fields" });
      }

      const hotel = await hotelReservation.create({
        ...initialData,
        checkInDate,
        checkOutDate,
        guests,
        specialRequest,
        room,
      });

      reservationData = hotel;

      const vendorSocket = getVendorSocket(vendor);
      if (vendorSocket && vendorSocket.readyState === 1) {
        // 1 = OPEN
        vendorSocket.send(
          JSON.stringify({
            type: "new_reservation",
            data: {
              _id: restaurant._id,
              customerName,
              customerId,
              customerEmail,
              vendor,
              guests,
              reservationType: reservationType,
              reservationStatus: "Upcoming",
              location,
              totalAmount,
              paymentStatus: "Not Paid",
              message: "You have a new reservation",
            },
          })
        );
      }
    }

    return res.status(201).json({
      message: "Created Reservation succesfully",
      data: reservationData,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const getReservations = async (req, res) => {
  const { vendorId, userId, bookingId } = req.query;
  try {
    const query = {};
    if (!vendorId && !userId && !bookingId) {
      return res.status(401).json({
        message: "Not Authorized",
      });
    }

    if (bookingId) {
      query._id = bookingId;
    }

    if (vendorId) {
      query.vendor = vendorId;
    }

    if (userId) {
      query.customerId = userId;
    }

    const reservations = await Booking.find(query)
      .populate({
        path: "menus.menu",
      })
      .populate({
        path: "vendor",
      });

    return res.status(200).json({
      message: "Fetched Reservations Succesfully",
      data: reservations,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: error.message,
    });
  }
};
