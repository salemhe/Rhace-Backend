import express from "express";
import cors from "cors";
import morgan from "morgan";
import authRoutes from "./routes/auth.routes.js";
import branchRoutes from "./routes/branch.routes.js";
import menuRoutes from "./routes/menu.routes.js";
import reservationRoutes from "./routes/reservation.routes.js";
import paymentRoutes from "./routes/payment.routes.js";

const app = express();

app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

app.use("/api/auth", authRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/menus", menuRoutes);
app.use("/api/reservations", reservationRoutes);
app.use("/api/payments", paymentRoutes);

// 404 Error Handler
app.use((req, res, next) => {
  res.status(404).json({ message: "Not Found" });
});

export default app;
