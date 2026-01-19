import { Vendor } from "../models/vendor.model.js";
import KYC from "../models/kyc.model.js";
import BankAccount from "../models/bankaccount.model.js";
import Reservation from "../models/reservation.model.js";
import Branch from "../models/branch.model.js";
import { recordAuditLog } from "../utils/auditLogger.js";
import pkg from "json-2-csv";
import * as XLSX from "xlsx";
import { Menu } from "../models/menu.model.js";

const { AsyncParser } = pkg;

// @desc    Get public vendors for search (no auth required)
// @route   GET /api/vendors/public
// @access  Public
export const getPublicVendors = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      vendorType,
      sortBy,
      sortOrder,
    } = req.query;

    const query = {
      isVerified: true,
      isVisible: true,
    };

    if (search) {
      query.$or = [
        { businessName: { $regex: search, $options: "i" } },
        { address: { $regex: search, $options: "i" } },
      ];
    }

    if (vendorType) query.vendorType = vendorType;

    const sort = {};
    if (sortBy) {
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;
    } else {
      sort.rating = -1; // Default sort by rating
    }

    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sort,
      select: "businessName vendorType email phone address profileImages rating reviews website priceRange vendorTypeCategory createdAt", // Only public fields
    };

    const vendors = await Vendor.paginate(query, options);

    res.status(200).json(vendors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all vendors with search, filter, sort, pagination
// @route   GET /api/vendors
// @access  Private (Admin, Manager)
export const getVendors = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      vendorType,
      isVerified,
      sortBy,
      sortOrder,
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { businessName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    if (status) query.status = status;
    if (vendorType) query.vendorType = vendorType;
    if (isVerified !== undefined) query.isVerified = isVerified === "true";

    const sort = {};
    if (sortBy) {
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;
    } else {
      sort.createdAt = -1;
    }

    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sort,
    };

    const vendors = await Vendor.paginate(query, options);

    // Add derived reservation counts
    const vendorsWithCounts = await Promise.all(
      vendors.docs.map(async (vendor) => {
        const reservationCount = await Reservation.countDocuments({
          vendor: vendor._id,
          status: { $nin: ['cancelled'] } // Count all reservations except cancelled ones
        });
        return {
          ...vendor.toObject(),
          reservationCount,
        };
      })
    );

    res.status(200).json({
      ...vendors,
      docs: vendorsWithCounts,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single vendor by ID
// @route   GET /api/vendors/:id
// @access  Private (Admin, Manager)
export const getVendorById = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // Get KYC info
    const kyc = await KYC.findOne({ vendor: req.params.id });

    // Get bank account info
    const bankAccount = await BankAccount.findOne({ vendor: req.params.id });

    // Get reservation count
    const reservationCount = await Reservation.countDocuments({
      vendor: req.params.id,
    });

    // Get branch count
    const branchCount = await Branch.countDocuments({
      vendor: req.params.id,
    });

    const vendorData = vendor.toObject();

    // Provide defaults for missing fields to prevent "Unknown" displays
    const responseData = {
      ...vendorData,
      businessName: vendorData.businessName || "Unknown Vendor",
      vendorTypeCategory: vendorData.vendorTypeCategory || "No category",
      status: vendorData.status || "Inactive",
      email: vendorData.email || "Not specified",
      phone: vendorData.phone || "Not provided",
      address: vendorData.address || "Not provided",
      website: vendorData.website || "Not provided",
      kyc,
      bankAccount,
      reservationCount,
      branchCount,
    };

    res.status(200).json(responseData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Approve/reject vendor
// @route   PATCH /api/vendors/:id/approval
// @access  Private (Admin)
export const updateVendorApproval = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body; // "approved", "rejected"

    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    vendor.isVerified = status === "approved";
    if (status === "rejected") {
      vendor.status = "rejected";
    } else if (status === "approved") {
      vendor.status = "active";
    }
    await vendor.save();

    await recordAuditLog(req.user._id, "VENDOR_APPROVAL_CHANGE", "Vendor", vendor._id, {
      changedBy: req.user._id,
      newStatus: status,
      rejectionReason,
    });

    res.status(200).json(vendor);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update vendor status
// @route   PATCH /api/vendors/:id/status
// @access  Private (Admin, Manager)
export const updateVendorStatus = async (req, res) => {
  try {
    const { status } = req.body; // "active", "inactive", "pending"

    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    vendor.status = status;
    await vendor.save();

    await recordAuditLog(req.user._id, "VENDOR_STATUS_CHANGE", "Vendor", vendor._id, {
      changedBy: req.user._id,
      newStatus: status,
    });

    res.status(200).json(vendor);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update vendor commission rate
// @route   PATCH /api/vendors/:id/commission
// @access  Private (Admin)
export const updateVendorCommission = async (req, res) => {
  try {
    const { percentageCharge } = req.body;

    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    vendor.percentageCharge = percentageCharge;
    await vendor.save();

    await recordAuditLog(req.user._id, "VENDOR_COMMISSION_CHANGE", "Vendor", vendor._id, {
      changedBy: req.user._id,
      newCommission: percentageCharge,
    });

    res.status(200).json(vendor);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Submit KYC for vendor
// @route   POST /api/vendors/:id/kyc
// @access  Private (Vendor)
export const submitKYC = async (req, res) => {
  try {
    const { documentType, documentNumber, expiryDate } = req.body;
    const documentUrl = req.file ? req.file.path : req.body.documentUrl;

    const existingKYC = await KYC.findOne({ vendor: req.params.id });
    if (existingKYC) {
      return res.status(400).json({ message: "KYC already submitted" });
    }

    const kyc = new KYC({
      vendor: req.params.id,
      documentType,
      documentNumber,
      documentUrl,
      expiryDate,
    });

    await kyc.save();
    res.status(201).json(kyc);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Verify KYC
// @route   PATCH /api/vendors/:id/kyc/verify
// @access  Private (Admin)
export const verifyKYC = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;

    const kyc = await KYC.findOne({ vendor: req.params.id });
    if (!kyc) {
      return res.status(404).json({ message: "KYC not found" });
    }

    kyc.status = status;
    kyc.rejectionReason = rejectionReason;
    kyc.verifiedBy = req.user._id;
    kyc.verifiedAt = new Date();
    await kyc.save();

    // Update vendor verification status
    const vendor = await Vendor.findById(req.params.id);
    if (vendor) {
      vendor.isVerified = status === "approved";
      await vendor.save();
    }

    await recordAuditLog(req.user._id, "KYC_VERIFICATION", "Vendor", req.params.id, {
      verifiedBy: req.user._id,
      status,
      rejectionReason,
    });

    res.status(200).json(kyc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add/update bank account
// @route   POST /api/vendors/:id/bank-account
// @access  Private (Vendor, Admin)
export const updateBankAccount = async (req, res) => {
  try {
    const { accountName, accountNumber, bankCode, bankName } = req.body;

    let bankAccount = await BankAccount.findOne({ vendor: req.params.id });

    if (bankAccount) {
      bankAccount.accountName = accountName;
      bankAccount.accountNumber = accountNumber;
      bankAccount.bankCode = bankCode;
      bankAccount.bankName = bankName;
      bankAccount.isVerified = false; // Reset verification on update
    } else {
      bankAccount = new BankAccount({
        vendor: req.params.id,
        accountName,
        accountNumber,
        bankCode,
        bankName,
      });
    }

    await bankAccount.save();
    res.status(200).json(bankAccount);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Verify bank account
// @route   PATCH /api/vendors/:id/bank-account/verify
// @access  Private (Admin)
export const verifyBankAccount = async (req, res) => {
  try {
    const bankAccount = await BankAccount.findOne({ vendor: req.params.id });
    if (!bankAccount) {
      return res.status(404).json({ message: "Bank account not found" });
    }

    bankAccount.isVerified = true;
    bankAccount.verificationDate = new Date();
    await bankAccount.save();

    await recordAuditLog(req.user._id, "BANK_ACCOUNT_VERIFICATION", "Vendor", req.params.id, {
      verifiedBy: req.user._id,
    });

    res.status(200).json(bankAccount);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Bulk update vendors
// @route   POST /api/vendors/bulk-update
// @access  Private (Admin)
export const bulkUpdateVendors = async (req, res) => {
  try {
    const { vendorIds, updates } = req.body;

    const result = await Vendor.updateMany(
      { _id: { $in: vendorIds } },
      { $set: updates }
    );

    await recordAuditLog(req.user._id, "BULK_VENDOR_UPDATE", "Vendor", null, {
      updatedBy: req.user._id,
      vendorIds,
      updates,
      affectedCount: result.modifiedCount,
    });

    res.status(200).json({
      message: `${result.modifiedCount} vendors updated`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get vendor statistics
// @route   GET /api/vendors/stats
// @access  Private (Admin, Manager)
export const getVendorStats = async (req, res) => {
  try {
    const total = await Vendor.countDocuments();
    const active = await Vendor.countDocuments({ status: "active" });
    const inactive = await Vendor.countDocuments({ status: "inactive" });
    const suspended = await Vendor.countDocuments({ status: "suspended" });

    res.status(200).json({
      total,
      active,
      inactive,
      suspended,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Export vendors to CSV/XLSX
// @route   GET /api/vendors/export
// @access  Private (Admin, Manager)
export const exportVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find().select("-password");

    const dataToExport = await Promise.all(
      vendors.map(async (vendor) => {
        const reservationCount = await Reservation.countDocuments({
          vendor: vendor._id,
        });
        return {
          businessName: vendor.businessName,
          email: vendor.email,
          phone: vendor.phone,
          vendorType: vendor.vendorType,
          isVerified: vendor.isVerified,
          status: vendor.status,
          balance: vendor.balance,
          percentageCharge: vendor.percentageCharge,
          rating: vendor.rating,
          reviews: vendor.reviews,
          reservationCount,
          createdAt: vendor.createdAt,
        };
      })
    );

    const { format = "csv" } = req.query;

    if (format === "xlsx") {
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Vendors");
      const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      res.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.attachment("vendors.xlsx");
      return res.send(xlsxBuffer);
    } else {
      const parser = new AsyncParser();
      const csv = await parser.parse(dataToExport);

      res.header("Content-Type", "text/csv");
      res.attachment("vendors.csv");
      return res.send(csv);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


export const getOffers = async (req, res) => {
 try {
  const { id } = req.query;
  let offers = [];
  if (id) {
    offers = await Menu.findById(id)
      .populate({ path: "vendor"})
      .populate({ path: "items"})
      .sort({ createdAt: -1 });
  } else {
    offers = await Menu.find()
      .populate({ path: "vendor"})
      .populate({ path: "items"})
      .sort({ createdAt: -1 });
  }

  return res.status(200).json({
    message: "Fetched Offers Succesfully",
    data: offers,
  })
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// @desc    Update vendor details
// @route   PUT /api/vendors/:id
// @access  Private (Admin)
export const updateVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    const allowedFields = [
      'businessName', 'businessDescription', 'email', 'phone', 'address',
      'website', 'priceRange', 'vendorTypeCategory', 'profileImages',
      'percentageCharge', 'status', 'isVisible'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        vendor[field] = req.body[field];
      }
    });

    await vendor.save();

    await recordAuditLog(req.user._id, "VENDOR_UPDATE", "Vendor", vendor._id, {
      changedBy: req.user._id,
      updatedFields: allowedFields.filter(field => req.body[field] !== undefined),
    });

    res.status(200).json(vendor);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete vendor
// @route   DELETE /api/vendors/:id
// @access  Private (Admin)
export const deleteVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // Check if vendor has active reservations
    const activeReservations = await Reservation.countDocuments({
      vendor: req.params.id,
      status: { $in: ['pending', 'confirmed'] }
    });

    if (activeReservations > 0) {
      return res.status(400).json({
        message: "Cannot delete vendor with active reservations. Cancel all reservations first."
      });
    }

    await Vendor.findByIdAndDelete(req.params.id);

    await recordAuditLog(req.user._id, "VENDOR_DELETE", "Vendor", req.params.id, {
      deletedBy: req.user._id,
      vendorName: vendor.businessName,
    });

    res.status(200).json({ message: "Vendor deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getNearest = async (req, res) => {
  try {
    const { latitude, longitude, type } = req.query
    const nearbyQuery =
      latitude && longitude
        ? {
            location: {
              $near: {
                $geometry: {
                  type: "Point",
                  coordinates: [parseFloat(longitude), parseFloat(latitude)],
                },
                $maxDistance: 5000,
              },
            },
            vendorType: type,
          }
        : { vendorType: type };

    const vendors = await Vendor.find(nearbyQuery).sort({ createdAt: -1})

    return res.json({
      message: "Fetched Nearest Vendors",
      data: vendors
    })
   } catch (error) {
    console.error(error)
     res.status(500).json({ message: error.message });
   }
}

export const getTopRated = async (req, res) => {
  try {
    const { type, limit = 10 } = req.query;
    const query = { isVerified: true };
    
    if (type) {
      query.vendorType = type;
    }

    const vendors = await Vendor.find(query)
      .sort({ rating: -1 })
      .limit(parseInt(limit, 10))
      .select("businessName vendorType email phone address profileImages rating reviews website priceRange vendorTypeCategory createdAt offers categories");

    return res.json({
      message: "Fetched Top Rated Vendors",
      data: vendors,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};
