import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import express from "express";
import cors from "cors";
import app from "./app.js";
import connectDB from "./config/db.js";
import { startAllSchedulers } from "./jobs/index.js";
import { setupWebSocket } from "./websockets/socketManager.js";

dotenv.config();
connectDB();

const PORT = process.env.PORT || 5000;

// UNIVERSAL EXPRESS CORS
app.use(cors({
  origin: "*",
  methods: "*",
  allowedHeaders: "*",
  credentials: false
}));

const server = http.createServer(app);

// UNIVERSAL SOCKET.IO CORS
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: "*",
    allowedHeaders: "*"
  }
});

// Pass socket instance to manager (NOT server!)
setupWebSocket(io);

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

global.io = io;

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  startAllSchedulers();
});
