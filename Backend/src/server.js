import 'dotenv/config';
import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import router from "./routes.js";
import { errorHandler } from "./middleware.js";
import {
  User, Settings, Department, Designation, Holiday, LeaveType,
  Employee, Attendance, Correction, Leave, Payroll,
  Announcement, Notification, Audit, AILog
} from "./models.js";

if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required.");
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must contain at least 32 characters.");
}

await mongoose.connect(process.env.MONGO_URI);

// Build unique indexes before accepting setup and employee requests.
await Promise.all([
  User, Settings, Department, Designation, Holiday, LeaveType,
  Employee, Attendance, Correction, Leave, Payroll,
  Announcement, Notification, Audit, AILog
].map(Model => Model.init()));

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "[localhost](http://localhost:5173)"
}));
app.use(express.json({ limit: "2mb" }));

app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1200,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api", router);
app.use((req, res) => res.status(404).json({ message: "Endpoint not found." }));
app.use(errorHandler);

const server = app.listen(process.env.PORT || 5000, () => {
  console.log(`HCM Lite API listening on ${process.env.PORT || 5000}`);
});

async function shutdown() {
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
