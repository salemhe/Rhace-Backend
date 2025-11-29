import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const testGeocoding = async () => {
  const address = "1600 Amphitheatre Parkway, Mountain View, CA";
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  console.log("🔑 Testing with Key starting with:", apiKey ? apiKey.substring(0, 5) + "..." : "UNDEFINED");

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    
    const response = await axios.get(url);

    if (response.data.status === 'OK') {
      console.log("✅ SUCCESS! The API Key is working.");
      console.log("Coords:", response.data.results[0].geometry.location);
    } else {
      console.log("❌ FAILED. Status:", response.data.status);
      console.log("⚠️ Error Message:", response.data.error_message); // <--- THIS IS WHAT WE NEED
    }
  } catch (error) {
    console.error("Network Error:", error.message);
  }
};

testGeocoding();