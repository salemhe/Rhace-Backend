import Staff from "../models/staff.model.js";
import pkg from "json-2-csv";
const { AsyncParser } = pkg;
import * as XLSX from "xlsx";
import crypto from "crypto";
import { sendPasswordResetEmail } from "../services/mail.service.js";

import bcrypt from "bcrypt";

// Create a new staff member
export const createStaff = async (req, res) => {
  try {
    if (req.body.password) {
      const salt = await bcrypt.genSalt(10);
      req.body.password = await bcrypt.hash(req.body.password, salt);
    } else {
      const salt = await bcrypt.genSalt(10);
      req.body.password = await bcrypt.hash("staff", salt);
    }
    const staff = new Staff(req.body);
    await staff.save();
    res.status(201).json(staff);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get all staff members with search, filter, sort, and pagination
export const getStaff = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, status, role, sortBy, sortOrder } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { staffId: { $regex: search, $options: "i" } },
        { jobTitle: { $regex: search, $options: "i" } },
      ];
    }

    if (status) {
      query.status = status;
    }

    if (role) {
      query.role = role;
    }

    const sort = {};
    if (sortBy) {
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;
    } else {
      sort.name = 1; // Default sort by name
    }

    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sort,
    };

    const staff = await Staff.paginate(query, options);
    res.status(200).json(staff);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single staff member by ID
export const getStaffById = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id).populate('branch', 'name');
    if (staff) {
      res.status(200).json(staff);
    } else {
      res.status(404).json({ message: "Staff member not found" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Export staff members to CSV
export const exportStaffCSV = async (req, res) => {
  try {
    const staff = await Staff.find().populate('branch', 'name');

    const dataToExport = staff.map(s => ({
      _id: s._id,
      name: s.name,
      phone: s.phone,
      email: s.email,
      staffId: s.staffId,
      jobTitle: s.jobTitle,
      branch: s.branch ? s.branch.name : '',
      role: s.role,
      status: s.status,
    }));

    const { format = "csv" } = req.query; // Default to CSV

    if (format === "xlsx") {
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Staff");
      const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      res.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.attachment("staff.xlsx");
      return res.send(xlsxBuffer);
    } else {
      // Default to CSV
      const parser = new AsyncParser();
      const csv = await parser.parse(dataToExport);

      res.header("Content-Type", "text/csv");
      res.attachment("staff.csv");
      return res.send(csv);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
  
};

// Update a staff member
export const updateStaff = async (req, res) => {
  try {
    const { name, phone, email, staffId, jobTitle, branch, role, permissions, status } = req.body;
    let photo = req.body.photo;

    const staff = await Staff.findById(req.params.id);

    if (!staff) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    // Handle image uploads if file is present
    if (req.file && req.file.filename) {
      photo = `/uploads/staff-avatars/${req.file.filename}`; // Assuming local storage
    }

    staff.name = name || staff.name;
    staff.phone = phone || staff.phone;
    staff.email = email || staff.email;
    staff.photo = photo || staff.photo; // Update if new image or provided in body
    staff.staffId = staffId || staff.staffId;
    staff.jobTitle = jobTitle || staff.jobTitle;
    staff.branch = branch || staff.branch;
    staff.role = role || staff.role;
    staff.permissions = permissions || staff.permissions;
    staff.status = status || staff.status;

    const updatedStaff = await staff.save();
    res.status(200).json(updatedStaff);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Modify staff roles
export const modifyStaffRoles = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id);
    if (!staff) {
      return res.status(404).json({ message: "Staff member not found" });
    }
    staff.role = req.body.role || staff.role;
    await staff.save();
    res.status(200).json(staff);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Suspend or activate staff member
export const toggleStaffStatus = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id);
    if (!staff) {
      return res.status(404).json({ message: "Staff member not found" });
    }
    staff.status = staff.status === "Active" ? "Inactive" : "Active"; // Corrected status values
    await staff.save();
    res.status(200).json(staff);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete a staff member
export const deleteStaff = async (req, res) => {
  try {
    const staff = await Staff.findByIdAndDelete(req.params.id);
    if (staff) {
      res.status(200).json({ message: "Staff member removed" });
    } else {
      res.status(404).json({ message: "Staff member not found" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

