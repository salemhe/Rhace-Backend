import Hotel from "../models/hotel.model.js";
import HotelPolicy from "../models/hotelpolicy.model.js";
import PaymentSettings from "../models/paymentsettings.model.js";
import RoomType from "../models/roomtype.model.js";
import { recordAuditLog } from "../utils/auditLogger.js";
import { geocodeAddress } from "../services/geocoding.service.js"; // Import geocoding service
import { nanoid } from "nanoid"; // Import nanoid for unique ID generation

// @desc    Create a new hotel (initially as a draft)
// @route   POST /api/hotels
// @access  Private/Admin/Manager
export const createHotel = async (req, res) => {
  try {
    const { name, phone, email, address, type, categories } = req.body;
    let { branchCode, coordinates } = req.body;
    let logoUrl = req.body.logoUrl; // Default from body, can be overridden by file upload
    let coverUrl = req.body.coverUrl; // Default from body, can be overridden by file upload

    // Auto-generate branchCode if not provided
    if (!branchCode) {
      let isUnique = false;
      while (!isUnique) {
        branchCode = nanoid(8); // Generate an 8-character unique ID
        const existingHotel = await Hotel.findOne({ branchCode });
        if (!existingHotel) {
          isUnique = true;
        }
      }
    } else {
      // Check if provided branchCode already exists
      const existingHotel = await Hotel.findOne({ branchCode });
      if (existingHotel) {
        return res.status(400).json({ message: "Hotel with this branch code already exists." });
      }
    }

    // Geocode address if not provided and address details are present
    if (!coordinates && address && address.fullAddress) {
      const geocoded = await geocodeAddress(address.fullAddress);
      if (geocoded) {
        coordinates = { latitude: geocoded.lat, longitude: geocoded.lng };
      }
    }

    // Handle image uploads if files are present
    if (req.files) {
      if (req.files.logo && req.files.logo.length > 0) {
        logoUrl = req.files.logo[0].location; // Assuming multer-s3 provides 'location'
      }
      if (req.files.cover && req.files.cover.length > 0) {
        coverUrl = req.files.cover[0].location; // Assuming multer-s3 provides 'location'
      }
    }

    const hotel = new Hotel({
      name,
      phone,
      email,
      address,
      coordinates,
      type,
      categories,
      branchCode,
      logoUrl,
      coverUrl,
      createdBy: req.user._id, // Assuming req.user is populated by auth middleware
      status: "draft", // Always create as draft initially
    });

    await hotel.save();
    recordAuditLog(req.user._id, "CREATE_HOTEL", "Hotel", hotel._id, hotel.toObject());

    res.status(201).json(hotel);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all hotels (with optional filters)
// @route   GET /api/hotels
// @access  Private/Admin/Manager/Staff
export const getHotels = async (req, res) => {
  try {
    const {
      status,
      type,
      search,
      category,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    let query = {};

    if (status) {
      query.status = status;
    }

    if (type) {
      query.type = type;
    }

    if (category) {
      query.categories = category; // Assuming category is a single string to match in the array
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { "address.fullAddress": { $regex: search, $options: "i" } },
      ];
    }

    const totalHotels = await Hotel.countDocuments(query);

    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const hotels = await Hotel.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.status(200).json({
      total: totalHotels,
      page: parseInt(page),
      limit: parseInt(limit),
      hotels,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single hotel by ID
// @route   GET /api/hotels/:id
// @access  Private/Admin/Manager/Staff
export const getHotelById = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);

    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }

    res.status(200).json(hotel);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a hotel
// @route   PUT /api/hotels/:id
// @access  Private/Admin/Manager
export const updateHotel = async (req, res) => {
  try {
    const { name, phone, email, address, type, categories, branchCode, status, policyId, paymentSettingsId } = req.body;
    let { coordinates, logoUrl, coverUrl } = req.body;

    const hotel = await Hotel.findById(req.params.id);

    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }

    // Check for unique branchCode on update if it's being changed
    if (branchCode && branchCode !== hotel.branchCode) {
      const existingHotel = await Hotel.findOne({ branchCode });
      if (existingHotel) {
        return res.status(400).json({ message: "Hotel with this branch code already exists." });
      }
    }

    // Geocode address if not provided and address details are present, or if address changed
    if (address && address.fullAddress && (!coordinates || (address.fullAddress !== hotel.address.fullAddress))) {
      const geocoded = await geocodeAddress(address.fullAddress);
      if (geocoded) {
        coordinates = { latitude: geocoded.lat, longitude: geocoded.lng };
      }
    }

    hotel.name = name || hotel.name;
    hotel.phone = phone || hotel.phone;
    hotel.email = email || hotel.email;
    hotel.address = address || hotel.address;
    hotel.coordinates = coordinates || hotel.coordinates;
    hotel.type = type || hotel.type;
    hotel.categories = categories || hotel.categories;
    hotel.branchCode = branchCode || hotel.branchCode;
    hotel.logoUrl = logoUrl || hotel.logoUrl;
    hotel.coverUrl = coverUrl || hotel.coverUrl;
    hotel.status = status || hotel.status; // Allow status update (e.g., to published)
    hotel.policyId = policyId || hotel.policyId;
    hotel.paymentSettingsId = paymentSettingsId || hotel.paymentSettingsId;

    const updatedHotel = await hotel.save();
    recordAuditLog(req.user._id, "UPDATE_HOTEL", "Hotel", updatedHotel._id, updatedHotel.toObject());

    res.status(200).json(updatedHotel);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a hotel
// @route   DELETE /api/hotels/:id
// @access  Private/Admin
export const deleteHotel = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);

    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }

    await hotel.deleteOne();
    recordAuditLog(req.user._id, "DELETE_HOTEL", "Hotel", req.params.id, {});

    res.status(200).json({ message: "Hotel removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Publish a hotel
// @route   PATCH /api/hotels/:id/publish
// @access  Private/Admin/Manager
export const publishHotel = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);

    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }

    if (hotel.status === "published") {
      return res.status(400).json({ message: "Hotel is already published." });
    }

    // --- Comprehensive Validation before publishing ---
    const roomTypes = await RoomType.find({ hotelId: hotel._id });
    if (roomTypes.length === 0) {
      return res.status(400).json({ message: "Hotel must have at least one room type before publishing." });
    }

    for (const rt of roomTypes) {
      if (!rt.pricePerNight || rt.pricePerNight <= 0) {
        return res.status(400).json({ message: `Room type '${rt.name}' must have a valid price per night.` });
      }
      if (!rt.adultsCapacity || rt.adultsCapacity <= 0) {
        return res.status(400).json({ message: `Room type '${rt.name}' must have a valid adults capacity.` });
      }
      if (!rt.totalUnits || rt.totalUnits <= 0) {
        return res.status(400).json({ message: `Room type '${rt.name}' must have a valid total units.` });
      }
      // Optional: Check if room type has at least one image
      if (!rt.images || rt.images.length === 0) {
        return res.status(400).json({ message: `Room type '${rt.name}' should have at least one image.` });
      }
    }

    if (!hotel.policyId) {
      return res.status(400).json({ message: "Hotel must have a policy configured before publishing." });
    }
    if (!hotel.paymentSettingsId) {
      return res.status(400).json({ message: "Hotel must have payment settings configured before publishing." });
    }
    // --- End Comprehensive Validation ---

    hotel.status = "published";
    const publishedHotel = await hotel.save();
    recordAuditLog(req.user._id, "PUBLISH_HOTEL", "Hotel", publishedHotel._id, publishedHotel.toObject());

    res.status(200).json(publishedHotel);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Upload hotel images (logo and cover)
// @route   PATCH /api/hotels/:id/upload-images
// @access  Private/Admin/Manager
export const uploadHotelImagesController = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);

    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }

    if (req.files) {
      if (req.files.logo && req.files.logo.length > 0) {
        hotel.logoUrl = `/uploads/hotel-images/${req.files.logo[0].filename}`;
      }
      if (req.files.cover && req.files.cover.length > 0) {
        hotel.coverUrl = `/uploads/hotel-images/${req.files.cover[0].filename}`;
      }
    }

    const updatedHotel = await hotel.save();
    recordAuditLog(req.user._id, "UPLOAD_HOTEL_IMAGES", "Hotel", updatedHotel._id, { logoUrl: updatedHotel.logoUrl, coverUrl: updatedHotel.coverUrl });

    res.status(200).json(updatedHotel);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get hotel review details (hotel, policy, payment settings, room types)
// @route   GET /api/hotels/:id/review
// @access  Private/Admin/Manager/Staff
export const getHotelReviewDetails = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id)
      .populate("policyId")
      .populate("paymentSettingsId");

    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }

    const roomTypes = await RoomType.find({ hotelId: req.params.id }).populate("amenities");

    res.status(200).json({
      hotel,
      roomTypes,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};