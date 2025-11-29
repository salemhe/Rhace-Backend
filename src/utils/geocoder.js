import NodeGeocoder from "node-geocoder";
import dotenv from "dotenv"

dotenv.config();

const geocoder = NodeGeocoder({
  provider: "google",
  apiKey: process.env.GOOGLE_MAPS_API_KEY,
});

export default geocoder;
