import cron from "node-cron";
import axios from "axios";
import AccountSettings from "../models/accountsettings.model.js";

// Exchange rate update job
const updateExchangeRates = async () => {
  try {
    console.log("Starting exchange rate update job...");

    // Fetch latest exchange rates from a free API (e.g., exchangerate-api.com)
    const response = await axios.get(
      "https://api.exchangerate-api.com/v4/latest/USD"
    );

    const rates = response.data.rates;

    // Update default settings with new rates
    const defaultSettings = {
      exchangeRates: {
        USD: rates.USD,
        EUR: rates.EUR,
        GBP: rates.GBP,
        NGN: rates.NGN,
        lastUpdated: new Date(),
      },
    };

    // You might want to store this in a separate ExchangeRate model
    // For now, we'll just log it
    console.log("Exchange rates updated:", rates);

    // TODO: Store in database or cache
    // await ExchangeRate.findOneAndUpdate({}, defaultSettings, { upsert: true });

  } catch (error) {
    console.error("Exchange rate update failed:", error);
  }
};

// Schedule job to run daily at 2 AM
export const startExchangeRateJob = () => {
  cron.schedule("0 2 * * *", updateExchangeRates);
  console.log("Exchange rate job scheduled to run daily at 2 AM");
};

// Manual trigger for testing
export const triggerExchangeRateUpdate = updateExchangeRates;
