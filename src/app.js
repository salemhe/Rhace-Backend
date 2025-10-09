import express from "express";
import cors from "cors";
import morgan from "morgan";
import authRoutes from "./routes/auth.routes.js";
import branchRoutes from "./routes/branch.routes.js";
import menuRoutes from "./routes/menu.routes.js";
import bookingRoutes from "./routes/booking.routes.js";
import hotelRoutes from "./routes/hotel.routes.js";
import amenityRoutes from "./routes/amenity.routes.js";
import guestRoutes from "./routes/guest.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import { drinkRoutes, addOnRouter } from "./routes/drink.routes.js";
import bottleSetRoutes from "./routes/bottleSet.routes.js";
import clubRoutes from "./routes/club.routes.js";
import reviewRoutes from "./routes/review.routes.js";
import accountSettingsRoutes from "./routes/accountsettings.routes.js";


const app = express();

app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

app.use("/api/auth", authRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/menus", menuRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/hotels", hotelRoutes);
app.use("/api/amenities", amenityRoutes);
app.use("/api/guests", guestRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/account-settings", accountSettingsRoutes);
app.use("/api/clubs", clubRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/drinks", drinkRoutes);
app.use("/api/addons", addOnRouter);
app.use("/api/bottle-sets", bottleSetRoutes);

// 404 Error Handler
app.use((req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.status = 404;
  next(error);
});

// Global Error Handler
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    message: err.message || "An internal server error occurred.",
  });
});

export default app;