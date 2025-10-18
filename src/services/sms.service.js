// SMS service using Twilio
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

export const sendSMS = async (to, message) => {
  try {
    const result = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: to,
    });

    console.log(`SMS sent to ${to}: ${result.sid}`);
    return result;
  } catch (error) {
    console.error("SMS sending failed:", error);
    throw error;
  }
};

export const sendBulkSMS = async (recipients, message) => {
  try {
    const promises = recipients.map((to) => sendSMS(to, message));
    const results = await Promise.allSettled(promises);

    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    console.log(`Bulk SMS: ${successful} sent, ${failed} failed`);
    return { successful, failed };
  } catch (error) {
    console.error("Bulk SMS failed:", error);
    throw error;
  }
};
