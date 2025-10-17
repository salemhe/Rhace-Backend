import { scanBuffer } from "../services/fileScan.service.js";

export const scanUploadedFile = async (req, res, next) => {
  try {
    if (!req.file) {
      return next();
    }

    const scanResult = await scanBuffer(req.file.buffer, req.file.originalname);

    if (!scanResult.safe) {
      return res.status(400).json({
        message: "File contains malware and has been rejected",
        details: scanResult.message,
      });
    }

    next();
  } catch (error) {
    console.error("File scan error:", error);
    return res.status(500).json({
      message: "File scanning failed. Please try again.",
    });
  }
};

export const scanMultipleFiles = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return next();
    }

    const scanPromises = req.files.map((file) =>
      scanBuffer(file.buffer, file.originalname)
    );

    const scanResults = await Promise.all(scanPromises);

    const unsafeFiles = scanResults.filter((result) => !result.safe);

    if (unsafeFiles.length > 0) {
      return res.status(400).json({
        message: `${unsafeFiles.length} file(s) contain malware and have been rejected`,
      });
    }

    next();
  } catch (error) {
    console.error("Multiple file scan error:", error);
    return res.status(500).json({
      message: "File scanning failed. Please try again.",
    });
  }
};
