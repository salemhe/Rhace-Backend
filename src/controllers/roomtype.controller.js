import RoomType from "../models/roomtype.model.js";
import { HotelVendor } from "../models/vendor.model.js";
// import Hotel from "../models/hotel.model.js";
import { recordAuditLog } from "../utils/auditLogger.js";
import fs from "fs";
import path from "path";

// @desc    Create a new room type for a specific hotel
// @route   POST /api/hotels/:hotelId/roomtypes
// @access  Private/Admin/Manager
export const createRoomType = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { name, description, pricePerNight, adultsCapacity, childrenCapacity, totalUnits, amenities } = req.body;
    let images = req.body.images; // Default from body, can be overridden by file upload

    const hotel = await HotelVendor.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }

    // Handle image uploads if files are present
    if (req.files && req.files.length > 0) {
      images = req.files.map(file => file.location); // Assuming multer-s3 provides 'location'
    }

    const roomType = new RoomType({
      hotelId,
      name,
      description,
      pricePerNight,
      adultsCapacity,
      childrenCapacity,
      totalUnits,
      amenities,
      images,
    });

    await roomType.save();
    recordAuditLog(req.user._id, "CREATE_ROOM_TYPE", "RoomType", roomType._id, roomType.toObject());

    res.status(201).json(roomType);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all room types for a specific hotel
// @route   GET /api/hotels/:hotelId/roomtypes
// @access  Private/Admin/Manager/Staff
export const getRoomTypes = async (req, res) => {
  try {
    const { hotelId } = req.params;

    const hotel = await HotelVendor.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }

    const roomTypes = await RoomType.find({ hotelId }).populate("amenities");
    res.status(200).json(roomTypes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get a single room type by ID for a specific hotel
// @route   GET /api/hotels/:hotelId/roomtypes/:id
// @access  Private/Admin/Manager/Staff
export const getRoomTypeById = async (req, res) => {
  try {
    const { hotelId, id } = req.params;

    const roomType = await RoomType.findOne({ _id: id, hotelId }).populate("amenities");

    if (!roomType) {
      return res.status(404).json({ message: "Room type not found for this hotel" });
    }

    res.status(200).json(roomType);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a room type for a specific hotel
// @route   PUT /api/hotels/:hotelId/roomtypes/:id
// @access  Private/Admin/Manager
export const updateRoomType = async (req, res) => {
  try {
    const { hotelId, id } = req.params;
    const { name, description, pricePerNight, adultsCapacity, childrenCapacity, totalUnits, amenities, images } = req.body;

    const roomType = await RoomType.findOne({ _id: id, hotelId });

    if (!roomType) {
      return res.status(404).json({ message: "Room type not found for this hotel" });
    }

    roomType.name = name || roomType.name;
    roomType.description = description || roomType.description;
    roomType.pricePerNight = pricePerNight || roomType.pricePerNight;
    roomType.adultsCapacity = adultsCapacity || roomType.adultsCapacity;
    roomType.childrenCapacity = childrenCapacity || roomType.childrenCapacity;
    roomType.totalUnits = totalUnits || roomType.totalUnits;
    roomType.amenities = amenities || roomType.amenities;
    roomType.images = images || roomType.images;

    const updatedRoomType = await roomType.save();
    recordAuditLog(req.user._id, "UPDATE_ROOM_TYPE", "RoomType", updatedRoomType._id, updatedRoomType.toObject());

    res.status(200).json(updatedRoomType);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a room type for a specific hotel
// @route   DELETE /api/hotels/:hotelId/roomtypes/:id
// @access  Private/Admin/Manager
export const deleteRoomType = async (req, res) => {
  try {
    const { hotelId, id } = req.params;

    const roomType = await RoomType.findOne({ _id: id, hotelId });

    if (!roomType) {
      return res.status(404).json({ message: "Room type not found for this hotel" });
    }

    await roomType.deleteOne();
    recordAuditLog(req.user._id, "DELETE_ROOM_TYPE", "RoomType", id, {});

    res.status(200).json({ message: "Room type removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Upload room type images
// @route   PATCH /api/hotels/:hotelId/roomtypes/:id/upload-images
// @access  Private/Admin/Manager
export const uploadRoomTypeImagesController = async (req, res) => {
  try {
    const { hotelId, id } = req.params;

    const roomType = await RoomType.findOne({ _id: id, hotelId });

    if (!roomType) {
      return res.status(404).json({ message: "Room type not found for this hotel" });
    }

    if (req.files && req.files.length > 0) {
      // Check if adding new images would exceed the limit of 5
      if (roomType.images.length + req.files.length > 5) {
        // Clean up newly uploaded files if they exceed the limit
        req.files.forEach(file => {
          fs.unlink(file.path, (err) => {
            if (err) console.error("Error deleting uploaded file:", err);
          });
        });
        return res.status(400).json({ message: "Cannot upload more than 5 images per room type." });
      }

      // Map uploaded files to their URLs and add to existing images
      const newImageUrls = req.files.map(file => file.location); // Assuming multer-s3 provides 'location'
      roomType.images = [...roomType.images, ...newImageUrls];
    }

    const updatedRoomType = await roomType.save();
    recordAuditLog(req.user._id, "UPLOAD_ROOM_TYPE_IMAGES", "RoomType", updatedRoomType._id, { images: updatedRoomType.images });

    res.status(200).json(updatedRoomType);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a specific room type image
// @route   DELETE /api/hotels/:hotelId/roomtypes/:id/images
// @access  Private/Admin/Manager
export const deleteRoomTypeImage = async (req, res) => {
  try {
    const { hotelId, id } = req.params;
    const { imageUrl } = req.body; // The URL of the image to delete

    const roomType = await RoomType.findOne({ _id: id, hotelId });

    if (!roomType) {
      return res.status(404).json({ message: "Room type not found for this hotel" });
    }

    // Find the index of the image to delete
    const imageIndex = roomType.images.indexOf(imageUrl);

    if (imageIndex === -1) {
      return res.status(404).json({ message: "Image not found in this room type." });
    }

    // Remove the image URL from the array
    roomType.images.splice(imageIndex, 1);

    const updatedRoomType = await roomType.save();

    // Optionally, delete the physical file from the server
    // This assumes the imageUrl is a path relative to the project root or a full path
    const filePath = path.join(process.cwd(), imageUrl); // Adjust path as necessary
    fs.unlink(filePath, (err) => {
      if (err) console.error("Error deleting physical image file:", err);
    });

    recordAuditLog(req.user._id, "DELETE_ROOM_TYPE_IMAGE", "RoomType", updatedRoomType._id, { deletedImageUrl: imageUrl });

    res.status(200).json(updatedRoomType);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
