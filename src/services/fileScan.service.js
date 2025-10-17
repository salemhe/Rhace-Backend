// File scanning service using ClamAV
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export const scanFile = (filePath) => {
  return new Promise((resolve, reject) => {
    const clamscan = spawn("clamscan", ["--no-summary", filePath]);

    let stdout = "";
    let stderr = "";

    clamscan.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    clamscan.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    clamscan.on("close", (code) => {
      if (code === 0) {
        // File is clean
        resolve({ safe: true, message: "File is clean" });
      } else if (code === 1) {
        // Virus detected
        resolve({
          safe: false,
          message: "Virus detected",
          details: stdout || stderr,
        });
      } else {
        reject(new Error(`ClamAV scan failed with code ${code}: ${stderr}`));
      }
    });

    clamscan.on("error", (error) => {
      reject(new Error(`Failed to start ClamAV scan: ${error.message}`));
    });
  });
};

export const scanBuffer = async (buffer, filename) => {
  // Create temporary file
  const tempDir = path.join(process.cwd(), "temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  const tempFilePath = path.join(tempDir, `scan_${Date.now()}_${filename}`);

  try {
    // Write buffer to temporary file
    fs.writeFileSync(tempFilePath, buffer);

    // Scan the file
    const result = await scanFile(tempFilePath);

    // Clean up
    fs.unlinkSync(tempFilePath);

    return result;
  } catch (error) {
    // Clean up on error
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    throw error;
  }
};
