import { v2 as cloudinary } from 'cloudinary';
import { fileURLToPath } from 'url';
import path from 'path';
import { nanoid } from 'nanoid';

// Validate Cloudinary config
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.error('❌ Missing Cloudinary environment variables');
  throw new Error('Cloudinary configuration is required');
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadToCloudinary = async (fileBuffer, filename) => {
  try {
    const fileExtension = path.extname(filename).toLowerCase();
    const publicId = `profile-pics/${nanoid()}-${path.basename(filename, fileExtension)}`;

    const uploadOptions = {
      public_id: publicId,
      folder: 'profile-pics',
      resource_type: 'image',
      format: fileExtension.slice(1), // remove dot
      overwrite: true,
    };

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(error);
        } else {
          resolve(result);
        }
      }).end(fileBuffer);
    });

    return result.secure_url;
  } catch (error) {
    console.error('uploadToCloudinary failed:', error.message);
    throw error;
  }
};

