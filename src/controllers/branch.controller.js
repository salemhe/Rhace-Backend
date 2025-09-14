import Branch from "../models/branch.model.js";
import pkg from "json-2-csv";
const { AsyncParser } = pkg;
import * as XLSX from "xlsx";
import { generateToken } from "../utils/jwt.js";

// Branch login
export const loginBranch = async (req, res) => {
  const { email, password } = req.body;

  try {
    const branch = await Branch.findOne({ email });

    if (!branch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!(await branch.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    res.json({
      _id: branch._id,
      name: branch.name,
      email: branch.email,
      city: branch.city,
      state: branch.state,
      branchType: branch.branchType,
      token: generateToken(branch._id),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create a new branch
export const createBranch = async (req, res) => {
  try {
    const branch = new Branch(req.body);
    await branch.save();
    res.status(201).json(branch);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get all branches with search, filter, sort, and pagination
export const getBranches = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { address: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
        { state: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    if (status) {
      query.status = status;
    }

    const totalBranches = await Branch.countDocuments(query);
    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const branches = await Branch.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.status(200).json({
      total: totalBranches,
      page: parseInt(page),
      limit: parseInt(limit),
      branches,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Export branches to CSV
export const exportBranchesCSV = async (req, res) => {
  try {
    const { search, status } = req.query;

    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { address: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
        { state: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    if (status) {
      query.status = status;
    }

    const branches = await Branch.find(query).lean();

    const dataToExport = branches.map((branch) => ({
      _id: branch._id,
      name: branch.name,
      address: branch.address,
      email: branch.email,
      city: branch.city,
      state: branch.state,
      phone: branch.phone,
      branchType: branch.branchType,
      operatingDays: branch.operatingDays.join(", "),
      operatingHoursFrom: branch.operatingHours.from,
      operatingHoursTo: branch.operatingHours.to,
      capacity: branch.capacity,
      minLeadTimeHours: branch.minLeadTimeHours,
      cutOffTimeMinutes: branch.cutOffTimeMinutes,
      manager: branch.manager,
      status: branch.status,
      createdAt: branch.createdAt ? branch.createdAt.toISOString() : "",
      updatedAt: branch.updatedAt ? branch.updatedAt.toISOString() : "",
    }));

    const { format = "csv" } = req.query; // Default to CSV

    if (format === "xlsx") {
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Branches");
      const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      res.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.attachment("branches.xlsx");
      return res.send(xlsxBuffer);
    } else {
      // Default to CSV
      const asyncParser = new AsyncParser();
      const csv = await asyncParser.parse(dataToExport);

      res.header("Content-Type", "text/csv");
      res.attachment("branches.csv");
      res.send(csv);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update a branch
export const updateBranch = async (req, res) => {
  try {
    const branch = await Branch.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (branch) {
      res.status(200).json(branch);
    } else {
      res.status(404).json({ message: "Branch not found" });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete a branch
export const deleteBranch = async (req, res) => {
  try {
    const branch = await Branch.findByIdAndDelete(req.params.id);
    if (branch) {
      res.status(200).json({ message: "Branch deleted successfully" });
    } else {
      res.status(404).json({ message: "Branch not found" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Toggle branch visibility (open/close)
export const toggleBranchVisibility = async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) {
      return res.status(404).json({ message: "Branch not found" });
    }
    branch.status = branch.status === "Opened" ? "Closed" : "Opened";
    const updatedBranch = await branch.save();
    res.status(200).json(updatedBranch);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
