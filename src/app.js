import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from 'cookie-parser';
import { authRoutes,
  adminRoutes,
menuRoutes,
bookingRoutes,
hotelRoutes,
dashboardRoutes,
drinkRoutes,
tableRoutes,
addOnRouter,
bottleSetRoutes,
reviewRoutes,
userRoutes,
vendorRoutes,
paymentRoutes,
settingRoutes,
notificationRoutes,
payoutRoutes,
searchRoutes,
paystackRoutes,
availabilityRoutes, 
reservationRoutes} from "./routes/index.js"


const app = express();

// Paystack webhook must be registered BEFORE body parsing middleware
app.use("/api/paystack", paystackRoutes);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors({
  origin: ["http://localhost:5173", "https://rhace-frontend.vercel.app", "https://www.rhace.co", "52.31.139.75", "52.49.173.169", "52.214.14.220"],
  credentials: true
}));
app.use(morgan("dev"));


app.use("/api/v1/auth", authRoutes);

app.use("/api/v1/admin", adminRoutes);

app.use("/api/v1/users", userRoutes);

app.use("/api/v1/vendors", vendorRoutes);

app.use("/api/v1/menus", menuRoutes);

app.use("/api/v1/bookings", bookingRoutes);

app.use("/api/v1/reservations", reservationRoutes)

app.use("/api/v1/hotels", hotelRoutes);

app.use("/api/v1/dashboard", dashboardRoutes);

app.use("/api/v1/reviews", reviewRoutes);

app.use("/api/v1/tables", tableRoutes);

app.use("/api/v1/drinks", drinkRoutes);

app.use("/api/v1/addons", addOnRouter);

app.use("/api/v1/bottle-sets", bottleSetRoutes);

app.use("/api/v1/payments", paymentRoutes);

app.use("/api/v1/settings", settingRoutes);

app.use("/api/v1/notifications", notificationRoutes);

app.use("/api/v1/payments/payouts", payoutRoutes);

app.use("/api/v1/search", searchRoutes)

app.use("/api/v1/availability", availabilityRoutes);

app.get("/", (_req, res) => {
  res.send("Welcome to Rhace Backend API");
})

export default app;