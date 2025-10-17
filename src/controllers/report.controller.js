                                                           import ReportJob from "../models/reportjob.model.js";
import Vendor from "../models/vendor.model.js";
import Reservation from "../models/reservation.model.js";
import PaymentTransaction from "../models/paymenttransaction.model.js";
import User from "../models/user.model.js";
import { recordAuditLog } from "../utils/auditLogger.js";
import pkg from "json-2-csv";
import * as XLSX from "xlsx";
import { uploadToCloudinary } from "../services/cloudinary.service.js";

const { AsyncParser } = pkg;

// @desc    Generate vendor earnings report
// @route   POST /api/reports/vendor-earnings
// @access  Private (Admin, Finance)
export const generateVendorEarningsReport = async (req, res) => {
  try {
    const { vendorId, dateFrom, dateTo, format = "csv" } = req.body;

    // Create report job
    const reportJob = new ReportJob({
      type: "vendor_earnings",
      parameters: { vendorId, dateFrom, dateTo, format },
      requestedBy: req.user._id,
    });
    await reportJob.save();

    // Process report asynchronously
    processVendorEarningsReport(reportJob._id);

    res.status(202).json({
      message: "Report generation started",
      jobId: reportJob._id,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Generate reservations report
// @route   POST /api/reports/reservations
// @access  Private (Admin, Ops)
export const generateReservationsReport = async (req, res) => {
  try {
    const { vendorId, branchId, dateFrom, dateTo, status, format = "csv" } = req.body;

    const reportJob = new ReportJob({
      type: "reservations",
      parameters: { vendorId, branchId, dateFrom, dateTo, status, format },
      requestedBy: req.user._id,
    });
    await reportJob.save();

    processReservationsReport(reportJob._id);

    res.status(202).json({
      message: "Report generation started",
      jobId: reportJob._id,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Generate payments report
// @route   POST /api/reports/payments
// @access  Private (Admin, Finance)
export const generatePaymentsReport = async (req, res) => {
  try {
    const { vendorId, dateFrom, dateTo, status, format = "csv" } = req.body;

    const reportJob = new ReportJob({
      type: "payments",
      parameters: { vendorId, dateFrom, dateTo, status, format },
      requestedBy: req.user._id,
    });
    await reportJob.save();

    processPaymentsReport(reportJob._id);

    res.status(202).json({
      message: "Report generation started",
      jobId: reportJob._id,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Generate users report
// @route   POST /api/reports/users
// @access  Private (Admin, Support)
export const generateUsersReport = async (req, res) => {
  try {
    const { role, status, dateFrom, dateTo, format = "csv" } = req.body;

    const reportJob = new ReportJob({
      type: "users",
      parameters: { role, status, dateFrom, dateTo, format },
      requestedBy: req.user._id,
    });
    await reportJob.save();

    processUsersReport(reportJob._id);

    res.status(202).json({
      message: "Report generation started",
      jobId: reportJob._id,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Generate vendors report
// @route   POST /api/reports/vendors
// @access  Private (Admin, Ops)
export const generateVendorsReport = async (req, res) => {
  try {
    const { vendorType, status, isVerified, format = "csv" } = req.body;

    const reportJob = new ReportJob({
      type: "vendors",
      parameters: { vendorType, status, isVerified, format },
      requestedBy: req.user._id,
    });
    await reportJob.save();

    processVendorsReport(reportJob._id);

    res.status(202).json({
      message: "Report generation started",
      jobId: reportJob._id,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get report job status
// @route   GET /api/reports/jobs/:id
// @access  Private
export const getReportJobStatus = async (req, res) => {
  try {
    const job = await ReportJob.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ message: "Report job not found" });
    }

    res.status(200).json(job);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Download completed report
// @route   GET /api/reports/download/:id
// @access  Private
export const downloadReport = async (req, res) => {
  try {
    const job = await ReportJob.findById(req.params.id);
    if (!job || job.status !== "completed") {
      return res.status(404).json({ message: "Report not found or not ready" });
    }

    // Increment download count
    job.downloadCount += 1;
    await job.save();

    // Stream file from storage (assuming Cloudinary or similar)
    // For now, return file info
    res.status(200).json({
      fileUrl: job.fileUrl,
      fileName: job.fileName,
      fileSize: job.fileSize,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Helper functions for processing reports
async function processVendorEarningsReport(jobId) {
  try {
    const job = await ReportJob.findById(jobId);
    job.status = "processing";
    await job.save();

    const { vendorId, dateFrom, dateTo, format } = job.parameters;

    const query = { vendor: vendorId };
    if (dateFrom && dateTo) {
      query.createdAt = { $gte: new Date(dateFrom), $lte: new Date(dateTo) };
    }

    const earnings = await PaymentTransaction.find(query)
      .populate("booking", "createdAt")
      .sort({ createdAt: -1 });

    const dataToExport = earnings.map((earning) => ({
      date: earning.createdAt,
      amount: earning.amount,
      method: earning.method,
      status: earning.status,
      bookingId: earning.booking?._id,
    }));

    const fileName = `vendor-earnings-${vendorId}-${Date.now()}`;
    let buffer, mimeType;

    if (format === "xlsx") {
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Earnings");
      buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else {
      const parser = new AsyncParser();
      const csv = await parser.parse(dataToExport);
      buffer = Buffer.from(csv, "utf8");
      mimeType = "text/csv";
    }

    // Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(buffer, `${fileName}.${format}`, 'reports');

    job.status = "completed";
    job.fileUrl = uploadResult.url;
    job.fileName = `${fileName}.${format}`;
    job.fileSize = uploadResult.size;
    job.completedAt = new Date();
    await job.save();

  } catch (error) {
    const job = await ReportJob.findById(jobId);
    job.status = "failed";
    job.errorMessage = error.message;
    await job.save();
  }
}

async function processReservationsReport(jobId) {
  try {
    const job = await ReportJob.findById(jobId);
    job.status = "processing";
    await job.save();

    const { vendorId, branchId, dateFrom, dateTo, status, format } = job.parameters;

    const query = {};
    if (vendorId) query.vendor = vendorId;
    if (branchId) query.branch = branchId;
    if (status) query.status = status;
    if (dateFrom && dateTo) {
      query.checkInDate = { $gte: new Date(dateFrom), $lte: new Date(dateTo) };
    }

    const reservations = await Reservation.find(query)
      .populate("vendor", "businessName vendorType")
      .populate("tableType", "name")
      .populate("roomType", "name")
      .populate("guest", "firstName lastName email phone")
      .populate("payment", "status amount method")
      .sort({ createdAt: -1 });

    const dataToExport = reservations.map((reservation) => ({
      id: reservation._id,
      vendorName: reservation.vendor?.businessName || "",
      vendorType: reservation.vendor?.vendorType || "",
      tableType: reservation.tableType?.name || "",
      roomType: reservation.roomType?.name || "",
      guestName: `${reservation.guest?.firstName || ""} ${reservation.guest?.lastName || ""}`,
      guestEmail: reservation.guest?.email || "",
      guestPhone: reservation.guest?.phone || "",
      checkInDate: reservation.checkInDate,
      checkOutDate: reservation.checkOutDate,
      partySize: reservation.partySize,
      status: reservation.status,
      paymentStatus: reservation.payment?.status || "unpaid",
      paymentAmount: reservation.payment?.amount || 0,
      paymentMethod: reservation.payment?.method || "",
      createdAt: reservation.createdAt,
    }));

    const fileName = `reservations-${Date.now()}`;
    let buffer;

    if (format === "xlsx") {
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Reservations");
      buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    } else {
      const parser = new AsyncParser();
      const csv = await parser.parse(dataToExport);
      buffer = Buffer.from(csv, "utf8");
    }

    // Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(buffer, `${fileName}.${format}`, 'reports');

    job.status = "completed";
    job.fileUrl = uploadResult.url;
    job.fileName = `${fileName}.${format}`;
    job.fileSize = uploadResult.size;
    job.completedAt = new Date();
    await job.save();

  } catch (error) {
    const job = await ReportJob.findById(jobId);
    job.status = "failed";
    job.errorMessage = error.message;
    await job.save();
  }
}

async function processPaymentsReport(jobId) {
  try {
    const job = await ReportJob.findById(jobId);
    job.status = "processing";
    await job.save();

    const { vendorId, dateFrom, dateTo, status, format } = job.parameters;

    const query = {};
    if (vendorId) query.vendor = vendorId;
    if (status) query.status = status;
    if (dateFrom && dateTo) {
      query.createdAt = { $gte: new Date(dateFrom), $lte: new Date(dateTo) };
    }

    const payments = await PaymentTransaction.find(query)
      .populate("vendor", "businessName vendorType")
      .populate("booking", "checkInDate checkOutDate")
      .sort({ createdAt: -1 });

    const dataToExport = payments.map((payment) => ({
      id: payment._id,
      vendorName: payment.vendor?.businessName || "",
      vendorType: payment.vendor?.vendorType || "",
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method,
      status: payment.status,
      reference: payment.reference,
      checkInDate: payment.booking?.checkInDate,
      checkOutDate: payment.booking?.checkOutDate,
      createdAt: payment.createdAt,
    }));

    const fileName = `payments-${Date.now()}`;
    let buffer;

    if (format === "xlsx") {
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Payments");
      buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    } else {
      const parser = new AsyncParser();
      const csv = await parser.parse(dataToExport);
      buffer = Buffer.from(csv, "utf8");
    }

    // Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(buffer, `${fileName}.${format}`, 'reports');

    job.status = "completed";
    job.fileUrl = uploadResult.url;
    job.fileName = `${fileName}.${format}`;
    job.fileSize = uploadResult.size;
    job.completedAt = new Date();
    await job.save();

  } catch (error) {
    const job = await ReportJob.findById(jobId);
    job.status = "failed";
    job.errorMessage = error.message;
    await job.save();
  }
}

async function processUsersReport(jobId) {
  try {
    const job = await ReportJob.findById(jobId);
    job.status = "processing";
    await job.save();

    const { role, status, dateFrom, dateTo, format } = job.parameters;

    const query = {};
    if (role) query.role = role;
    if (status) query.status = status;
    if (dateFrom && dateTo) {
      query.createdAt = { $gte: new Date(dateFrom), $lte: new Date(dateTo) };
    }

    const users = await User.find(query).sort({ createdAt: -1 });

    const dataToExport = users.map((user) => ({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      vendorType: user.vendorType,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
    }));

    const fileName = `users-${Date.now()}`;
    let buffer;

    if (format === "xlsx") {
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Users");
      buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    } else {
      const parser = new AsyncParser();
      const csv = await parser.parse(dataToExport);
      buffer = Buffer.from(csv, "utf8");
    }

    // Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(buffer, `${fileName}.${format}`, 'reports');

    job.status = "completed";
    job.fileUrl = uploadResult.url;
    job.fileName = `${fileName}.${format}`;
    job.fileSize = uploadResult.size;
    job.completedAt = new Date();
    await job.save();

  } catch (error) {
    const job = await ReportJob.findById(jobId);
    job.status = "failed";
    job.errorMessage = error.message;
    await job.save();
  }
}

async function processVendorsReport(jobId) {
  try {
    const job = await ReportJob.findById(jobId);
    job.status = "processing";
    await job.save();

    const { vendorType, status, isVerified, format } = job.parameters;

    const query = {};
    if (vendorType) query.vendorType = vendorType;
    if (status) query.status = status;
    if (isVerified !== undefined) query.isVerified = isVerified;

    const vendors = await Vendor.find(query).sort({ createdAt: -1 });

    const dataToExport = vendors.map((vendor) => ({
      id: vendor._id,
      businessName: vendor.businessName,
      vendorType: vendor.vendorType,
      email: vendor.email,
      phone: vendor.phone,
      address: vendor.address,
      status: vendor.status,
      isVerified: vendor.isVerified,
      createdAt: vendor.createdAt,
    }));

    const fileName = `vendors-${Date.now()}`;
    let buffer;

    if (format === "xlsx") {
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Vendors");
      buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    } else {
      const parser = new AsyncParser();
      const csv = await parser.parse(dataToExport);
      buffer = Buffer.from(csv, "utf8");
    }

    // Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(buffer, `${fileName}.${format}`, 'reports');

    job.status = "completed";
    job.fileUrl = uploadResult.url;
    job.fileName = `${fileName}.${format}`;
    job.fileSize = uploadResult.size;
    job.completedAt = new Date();
    await job.save();

  } catch (error) {
    const job = await ReportJob.findById(jobId);
    job.status = "failed";
    job.errorMessage = error.message;
    await job.save();
  }
}
