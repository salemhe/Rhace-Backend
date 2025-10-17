import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a file buffer to Cloudinary
 * @param {Buffer} buffer - File buffer
 * @param {string} fileName - Original file name
 * @param {string} folder - Cloudinary folder path
 * @returns {Promise<Object>} Upload result
 */
export const uploadToCloudinary = async (buffer, fileName, folder = 'reports') => {
  try {
    const fileExtension = path.extname(fileName).toLowerCase();
    const publicId = `${folder}/${Date.now()}-${path.basename(fileName, fileExtension)}`;

    const uploadOptions = {
      public_id: publicId,
      resource_type: 'raw', // For CSV/XLSX files
      format: fileExtension.slice(1), // Remove the dot
    };

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }).end(buffer);
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      size: result.bytes,
    };
  } catch (error) {
    throw new Error(`Cloudinary upload failed: ${error.message}`);
  }
};

/**
 * Delete a file from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} Delete result
 */
export const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'raw',
    });
    return result;
  } catch (error) {
    throw new Error(`Cloudinary delete failed: ${error.message}`);
  }
};

/**
 * Get Cloudinary URL for a public ID
 * @param {string} publicId - Cloudinary public ID
 * @returns {string} Secure URL
 */
export const getCloudinaryUrl = (publicId) => {
  return cloudinary.url(publicId, {
    secure: true,
    resource_type: 'raw',
  });
};
