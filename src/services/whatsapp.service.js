// WhatsApp service using Twilio
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;

const client = twilio(accountSid, authToken);

export const sendWhatsApp = async (to, message) => {
  try {
    // Format phone number for WhatsApp (add whatsapp: prefix)
    const whatsappTo = `whatsapp:${to}`;

    const result = await client.messages.create({
      body: message,
      from: `whatsapp:${twilioWhatsAppNumber}`,
      to: whatsappTo,
    });

    console.log(`WhatsApp message sent to ${to}: ${result.sid}`);
    return result;
  } catch (error) {
    console.error("WhatsApp sending failed:", error);
    throw error;
  }
};

export const sendBulkWhatsApp = async (recipients, message) => {
  try {
    const promises = recipients.map((to) => sendWhatsApp(to, message));
    const results = await Promise.allSettled(promises);

    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    console.log(`Bulk WhatsApp: ${successful} sent, ${failed} failed`);
    return { successful, failed };
  } catch (error) {
    console.error("Bulk WhatsApp failed:", error);
    throw error;
  }
};
