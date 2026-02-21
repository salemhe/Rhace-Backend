import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import express from "express";
import cors from "cors";
import app from "./app.js";
// import ngrok from "@ngrok/ngrok";
import connectDB from "./config/db.js";
import { startAllSchedulers } from "./jobs/index.js";
import { setupWebSocket } from "./websockets/socketManager.js";

// Load environment variables
dotenv.config();
connectDB();

// Server setup
const PORT = process.env.PORT || 5000;

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

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  startAllSchedulers();
});

// ngrok.connect({ addr: PORT, authtoken_from_env: true })
// 	.then(listener => console.log(`Ingress established at: ${listener.url()}`));