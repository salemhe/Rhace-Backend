import NodeGeocoder from "node-geocoder";
import dotenv from "dotenv"

dotenv.config();

const geocoder = NodeGeocoder({
  provider: "opencage",
  apiKey: process.env.OPENCAGE_API_KEY,
});

export default geocoder;
