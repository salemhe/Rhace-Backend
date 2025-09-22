import express from "express";
import cors from "cors";
import morgan from "morgan";
import authRoutes from "./routes/auth.routes.js";
import branchRoutes from "./routes/branch.routes.js";
import menuRoutes from "./routes/menu.routes.js";
import bookingRoutes from "./routes/booking.routes.js";
import hotelRoutes from "./routes/hotel.routes.js";
import amenityRoutes from "./routes/amenity.routes.js";
import guestRoutes from "./routes/guest.routes.js"; // Import guest routes
import dashboardRoutes from "./routes/dashboard.routes.js";
import accountSettingsRoutes from "./routes/accountsettings.routes.js";
import userRoutes from "./routes/user.routes.js"
import vendorRoutes from "./routes/vendor.routes.js"
import dotenv from "dotenv"

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

app.use("/api/auth", authRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/menus", menuRoutes);
app.use("/api/bookings", bookingRoutes);

// Wisdom's Update

app.use("/api/users", userRoutes);
app.use("/api/vendors", vendorRoutes);

//  End of Wisdom's Update

app.use("/api/hotels", hotelRoutes);
app.use("/api/amenities", amenityRoutes);
app.use("/api/guests", guestRoutes); // Use guest routes
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/account-settings", accountSettingsRoutes);

// 404 Error Handler
app.use((req, res, next) => {
  res.status(404).json({ message: "Not Found" });
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