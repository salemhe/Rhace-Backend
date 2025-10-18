import PDFDocument from "pdfkit";
import { PassThrough } from "stream";

export function generateBookingReceiptPDF(booking) {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const stream = new PassThrough();

  doc.pipe(stream);

  doc.fontSize(20).text("Booking Receipt", { align: "center" });
  doc.moveDown();

  doc.fontSize(12).text(`Booking Code: ${booking.bookingCode}`);
  doc.text(`Guest Name: ${booking.guest.name}`);
  doc.text(`Hotel: ${booking.hotel.name}`);
  doc.text(`Check-in Date: ${new Date(booking.checkInDate).toLocaleDateString()}`);
  doc.text(`Check-out Date: ${new Date(booking.checkOutDate).toLocaleDateString()}`);
  doc.text(`Guests: Adults - ${booking.guestsCount.adults}, Children - ${booking.guestsCount.children}`);
  doc.text(`Total Amount: ${booking.totalAmount} ${booking.currency}`);
  doc.text(`Payment Status: ${booking.paymentStatus}`);
  doc.moveDown();

  if (booking.mealSelections && booking.mealSelections.length > 0) {
    doc.text("Meal Selections:");
    booking.mealSelections.forEach((item, index) => {
      doc.text(`${index + 1}. ${item.menuItem.name} x${item.quantity}`);
    });
    doc.moveDown();
  }

  if (booking.notes) {
    doc.text("Notes:");
    doc.text(booking.notes);
    doc.moveDown();
  }

  doc.text("Thank you for your reservation!", { align: "center" });

  doc.end();

  return stream;
}
