import express from "express";
import cors from "cors";
import morgan from "morgan";
import { authRoutes,
adminRoutes,
branchRoutes,
menuRoutes,
bookingRoutes,
hotelRoutes,
amenityRoutes,
guestRoutes,
dashboardRoutes,
drinkRoutes,
tableRoutes,
addOnRouter,
bottleSetRoutes,
clubRoutes,
reviewRoutes,
accountSettingsRoutes,
userRoutes,
vendorRoutes,
reservationRoutes,
paymentRoutes,
settingRoutes,
notificationRoutes,
payoutRoutes,
reportRoutes,
searchRoutes,
staffRoutes,
paystackRoutes,
availabilityRoutes } from "./routes/index.js"


const app = express();

app.use(express.json());
app.use(cors({
  origin: ["http://localhost:5173", "https://rhace-frontend.vercel.app", "https://www.rhace.co", "52.31.139.75", "52.49.173.169", "52.214.14.220"],
  credentials: true
}));
app.use(morgan("dev"));


app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
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
app.use("/api/tables", tableRoutes);
app.use("/api/drinks", drinkRoutes);
app.use("/api/addons", addOnRouter);
app.use("/api/bottle-sets", bottleSetRoutes);

app.use("/api/users", userRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/reservations", reservationRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/settings", settingRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/payments/payouts", payoutRoutes);
app.use("/api/search", searchRoutes)
app.use("/api/staff", staffRoutes)
app.use("/api/reports", reportRoutes);

app.use("/api/paystack/webhook", paystackRoutes);

app.use("/api/availability", availabilityRoutes);

app.use("/", (_req, res) => {
  res.send("Welcome to Rhace Backend API");
})


app.use((_req, res) => {
  res.status(404).json({ message: "Not Found" });
});  


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