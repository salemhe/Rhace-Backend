import mongoose from "mongoose";
import dotenv from "dotenv";
import { Vendor } from "../models/vendor.model.js"; // Adjust path to your model
import geocoder from "../utils/geocoder.js"; // Adjust path to your utils

dotenv.config();

const updateVendorLocations = async () => {
  try {
    // 1. Connect to DB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🔥 Connected to DB");

    // 2. Find vendors that have an address BUT no coordinates
    // We check if coordinates array is empty or missing
    const vendors = await Vendor.find({
      address: { $exists: true, $ne: "" },
    });

    console.log(`Found ${vendors.length} vendors to update...`);

    let successCount = 0;
    let errorCount = 0;

    // 3. Loop and Update
    for (const vendor of vendors) {
      try {
        console.log(`Processing: ${vendor.businessName}`);

        const loc = await geocoder.geocode(vendor.address);

        if (loc.length > 0) {
          const { latitude, longitude } = loc[0];

          // Update the location field manually
          vendor.location = {
            type: "Point",
            coordinates: [longitude, latitude], // [Lng, Lat]
          };

          // We use updateOne instead of save() to avoid triggering 
          // other validation hooks or password hashing again
          await Vendor.updateOne(
            { _id: vendor._id },
            { $set: { location: vendor.location } }
          );

          console.log(`✅ Updated: ${vendor.businessName}`);
          successCount++;
        } else {
          console.log(`⚠️ No location found for address: ${vendor.address}`);
          errorCount++;
        }

      } catch (err) {
        console.error(`❌ Error updating ${vendor.businessName}:`, err.message);
        errorCount++;
      }
    }

    console.log("-----------------------------------");
    console.log(`Migration Complete.`);
    console.log(`Success: ${successCount}`);
    console.log(`Failed/Skipped: ${errorCount}`);

    process.exit();
  } catch (error) {
    console.error("Fatal Error:", error);
    process.exit(1);
  }
};

updateVendorLocations();