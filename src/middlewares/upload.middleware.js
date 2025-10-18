import multer from 'multer'

// Use memory storage (no files saved to disk)
const storage = multer.memoryStorage()

// File filter to accept only image files
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true)
  } else {
    cb(new Error("Only image files are allowed"), false)
  }
}

const upload = multer({ storage, fileFilter })

export default upload
