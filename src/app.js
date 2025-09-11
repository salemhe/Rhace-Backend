import express from "express";
import cors from "cors";
import morgan from "morgan";
import authRoutes from "./routes/auth.routes.js";

const app = express();

app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

app.use("/api/auth", authRoutes);

// 404 Error Handler
app.use((req, res, next) => {
  res.status(404).json({ message: "Not Found" });
});

export default app;
