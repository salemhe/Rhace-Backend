
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cloudinary = cloudinaryModule.v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadToCloudinary = async (fileBuffer, filename) => {
  const tempFilePath = path.join(__dirname, `${uuidv4()}-${filename}`);
  fs.writeFileSync(tempFilePath, fileBuffer);

  try {
    const result = await cloudinary.uploader.upload(tempFilePath, {
      folder: "assets",
      use_filename: true,
      unique_filename: false,
      overwrite: true,
    });
    return result.secure_url
  } finally {
    fs.unlinkSync(tempFilePath);
  }
};