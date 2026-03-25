

import TableType from "../models/tableType.model.js";
import BookingRules from "../models/bookingRules.model.js";
import { recordAuditLog } from "../utils/auditLogger.js";
import { geocodeAddress } from "../services/geocoding.service.js";
import { nanoid } from "nanoid";

// @desc    Create a new club
// @route   POST /api/clubs
// @access  Private/Admin
export const createClub = async (req, res) => {
  try {
    const { name, phone, email, address, category, shortDescription, dressCode, ageRestriction } = req.body;
    let { branchCode, coordinates } = req.body;
    let logoUrl = req.body.logoUrl;
    let coverUrl = req.body.coverUrl;

    if (!branchCode) {
      let isUnique = false;
      while (!isUnique) {
        branchCode = nanoid(8);
        const existingClub = await Club.findOne({ branchCode });
        if (!existingClub) {
          isUnique = true;
        }
      }
    } else {
      const existingClub = await Club.findOne({ branchCode });
      if (existingClub) {
        return res.status(400).json({ message: "Club with this branch code already exists." });
      }
    }

    if (!coordinates && address && address.fullAddress) {
      const geocoded = await geocodeAddress(address.fullAddress);
      if (geocoded) {
        coordinates = { latitude: geocoded.lat, longitude: geocoded.lng };
      }
    }

    if (req.files) {
      if (req.files.logo && req.files.logo.length > 0) {
        logoUrl = req.files.logo[0].location;
      }
      if (req.files.cover && req.files.cover.length > 0) {
        coverUrl = req.files.cover[0].location;
      }
    }

    const club = new Club({
      name,
      phone,
      email,
      address,
      coordinates,
      category,
      shortDescription,
      dressCode,
      ageRestriction,
      branchCode,
      logoUrl,
      coverUrl,
      createdBy: req.user._id,
    });

    await club.save();
    recordAuditLog(req.user._id, "CREATE_CLUB", "Club", club._id, club.toObject());

    res.status(201).json(club);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all clubs
// @route   GET /api/clubs
// @access  Public
export const getClubs = async (req, res) => {
  try {
    const { status, city, state, search, page = 1, limit = 1000, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    let query = {};

    if (status) {
      query.status = status;
    }

    if (city) {
      query["address.city"] = city;
    }

    if (state) {
      query["address.state"] = state;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { "address.fullAddress": { $regex: search, $options: "i" } },
      ];
    }

    const totalClubs = await Club.countDocuments(query);

    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const clubs = await Club.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.status(200).json({
      total: totalClubs,
      page: parseInt(page),
      limit: parseInt(limit),
      clubs,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single club by ID
// @route   GET /api/clubs/:id
// @access  Public
export const getClubById = async (req, res) => {
  try {
    const club = await Club.findById(req.params.id);

    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    res.status(200).json(club);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a club
// @route   PUT /api/clubs/:id
// @access  Private/Admin
export const updateClub = async (req, res) => {
  try {
    const { name, phone, email, address, category, shortDescription, dressCode, ageRestriction, branchCode, status } = req.body;
    let { coordinates, logoUrl, coverUrl } = req.body;

    const club = await Club.findById(req.params.id);

    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    if (branchCode && branchCode !== club.branchCode) {
      const existingClub = await Club.findOne({ branchCode });
      if (existingClub) {
        return res.status(400).json({ message: "Club with this branch code already exists." });
      }
    }

    if (address && address.fullAddress && (!coordinates || (address.fullAddress !== club.address.fullAddress))) {
      const geocoded = await geocodeAddress(address.fullAddress);
      if (geocoded) {
        coordinates = { latitude: geocoded.lat, longitude: geocoded.lng };
      }
    }

    club.name = name || club.name;
    club.phone = phone || club.phone;
    club.email = email || club.email;
    club.address = address || club.address;
    club.coordinates = coordinates || club.coordinates;
    club.category = category || club.category;
    club.shortDescription = shortDescription || club.shortDescription;
    club.dressCode = dressCode || club.dressCode;
    club.ageRestriction = ageRestriction || club.ageRestriction;
    club.branchCode = branchCode || club.branchCode;
    club.logoUrl = logoUrl || club.logoUrl;
    club.coverUrl = coverUrl || club.coverUrl;
    club.status = status || club.status;

    const updatedClub = await club.save();
    recordAuditLog(req.user._id, "UPDATE_CLUB", "Club", updatedClub._id, updatedClub.toObject());

    res.status(200).json(updatedClub);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a club
// @route   DELETE /api/clubs/:id
// @access  Private/Admin
export const deleteClub = async (req, res) => {
  try {
    const club = await Club.findById(req.params.id);

    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    await club.deleteOne();
    recordAuditLog(req.user._id, "DELETE_CLUB", "Club", req.params.id, {});

    res.status(200).json({ message: "Club removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update club status
// @route   PATCH /api/clubs/:id/status
// @access  Private/Admin
export const updateClubStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const club = await Club.findById(req.params.id);

    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    club.status = status;
    const updatedClub = await club.save();
    recordAuditLog(req.user._id, "UPDATE_CLUB_STATUS", "Club", updatedClub._id, { status: updatedClub.status });

    res.status(200).json(updatedClub);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Publish club (validate prerequisites)
// @route   PATCH /api/clubs/:id/publish
// @access  Private/Admin/Vendor
export const publishClub = async (req, res) => {
  try {
    const club = await Club.findById(req.params.id).populate('paymentSettingsId');
    
    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }
    
    if (club.status === "published") {
      return res.status(400).json({ message: "Club already published" });
    }

    // Validation checks
    const tableTypes = await TableType.countDocuments({ clubId: club._id });
    if (tableTypes === 0) {
      return res.status(400).json({ message: "Club needs at least one table type before publishing" });
    }

    if (!club.paymentSettingsId) {
      return res.status(400).json({ message: "Club must have payment settings configured (/vendors/:id/payment-settings)" });
    }

    club.status = "published";
    const publishedClub = await club.save();
    
    recordAuditLog(req.user._id, "PUBLISH_CLUB", "Club", publishedClub._id);
    res.json(publishedClub);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};


// Table Types

// @desc    Create a new table type for a club
// @route   POST /api/clubs/:clubId/table-types
// @access  Private/Admin
export const createTableType = async (req, res) => {
  try {
    const { clubId } = req.params;
    const tableType = new TableType({ ...req.body, clubId });
    await tableType.save();
    res.status(201).json(tableType);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all table types for a club
// @route   GET /api/clubs/:clubId/table-types
// @access  Private/Admin
export const getTableTypes = async (req, res) => {
  try {
    const { clubId } = req.params;
    const tableTypes = await TableType.find({ clubId });
    res.status(200).json(tableTypes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get a single table type by ID
// @route   GET /api/clubs/:clubId/table-types/:tableTypeId
// @access  Private/Admin
export const getTableTypeById = async (req, res) => {
  try {
    const { tableTypeId } = req.params;
    const tableType = await TableType.findById(tableTypeId);
    if (!tableType) {
      return res.status(404).json({ message: "Table type not found" });
    }
    res.status(200).json(tableType);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a table type
// @route   PUT /api/clubs/:clubId/table-types/:tableTypeId
// @access  Private/Admin
export const updateTableType = async (req, res) => {
  try {
    const { tableTypeId } = req.params;
    const tableType = await TableType.findByIdAndUpdate(tableTypeId, req.body, { new: true });
    if (!tableType) {
      return res.status(404).json({ message: "Table type not found" });
    }
    res.status(200).json(tableType);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a table type
// @route   DELETE /api/clubs/:clubId/table-types/:tableTypeId
// @access  Private/Admin
export const deleteTableType = async (req, res) => {
  try {
    const { tableTypeId } = req.params;
    const tableType = await TableType.findByIdAndDelete(tableTypeId);
    if (!tableType) {
      return res.status(404).json({ message: "Table type not found" });
    }
    res.status(200).json({ message: "Table type removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Booking Rules

// @desc    Get booking rules for a club
// @route   GET /api/clubs/:clubId/booking-rules
// @access  Private/Admin
export const getBookingRules = async (req, res) => {
  try {
    const { clubId } = req.params;
    const bookingRules = await BookingRules.findOne({ clubId });
    if (!bookingRules) {
      // If no rules are found, return default rules or an empty object
      return res.status(200).json({ clubId, message: "No booking rules found for this club." });
    }
    res.status(200).json(bookingRules);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update booking rules for a club
// @route   PUT /api/clubs/:clubId/booking-rules
// @access  Private/Admin
export const updateBookingRules = async (req, res) => {
  try {
    const { clubId } = req.params;
    const bookingRules = await BookingRules.findOneAndUpdate({ clubId }, req.body, { new: true, upsert: true });
    res.status(200).json(bookingRules);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
