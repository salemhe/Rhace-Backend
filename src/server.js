import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import app from "./app.js";
import connectDB from "./config/db.js";
import { startAllSchedulers } from "./jobs/index.js";
import { setupWebSocket } from "./websockets/socketManager.js";

dotenv.config();

connectDB();

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Adjust for production
  },
});

setupWebSocket(server);

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// Make io available globally or export it
global.io = io;

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  startAllSchedulers(); // Start all scheduled jobs
});
