import { Vendor } from '../models/vendor.model.js';
import PaymentTransaction from '../models/paymenttransaction.model.js';
import Payout from '../models/payout.model.js';
import { recordAuditLog } from '../utils/auditLogger.js';

/**
 * Reconciles the balances of all vendors.
 * This job calculates the expected balance based on successful transactions and processed payouts,
 * compares it against the stored balance, and logs any discrepancies.
 */
export const reconcileVendorBalances = async () => {
  console.log('Starting vendor balance reconciliation job.');
  try {
    const vendors = await Vendor.find({});

    for (const vendor of vendors) {
      // Calculate total successful transactions by joining with bookings
      const successfulTransactions = await PaymentTransaction.aggregate([
        {
          $lookup: {
            from: 'bookings', // The actual name of the bookings collection in the DB
            localField: 'booking',
            foreignField: '_id',
            as: 'bookingInfo'
          }
        },
        {
          $unwind: '$bookingInfo'
        },
        {
          $match: {
            'bookingInfo.vendor': vendor._id,
            status: 'succeeded'
          }
        },
        {
          $group: { _id: null, total: { $sum: '$amount' } }
        }
      ]);
      const totalEarnings = successfulTransactions.length > 0 ? successfulTransactions[0].total : 0;

      // Calculate total processed payouts
      const processedPayouts = await Payout.aggregate([
        { $match: { vendor: vendor._id, status: 'processed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const totalPayouts = processedPayouts.length > 0 ? processedPayouts[0].total : 0;

      // Calculate expected balance, considering the vendor's commission
      const commissionRate = vendor.percentageCharge / 100;
      const netEarnings = totalEarnings * (1 - commissionRate);
      const expectedBalance = netEarnings - totalPayouts;

      const storedBalance = vendor.balance;

      if (Math.abs(storedBalance - expectedBalance) > 0.01) { // Use a small tolerance for floating point issues
        const discrepancy = expectedBalance - storedBalance;
        console.error(`Discrepancy found for vendor ${vendor.businessName} (ID: ${vendor._id}).
          - Stored Balance: ${storedBalance}
          - Expected Balance: ${expectedBalance}
          - Discrepancy: ${discrepancy}`);

        // ✅ Log the discrepancy for audit purposes (now with proper null handling)
        await recordAuditLog(
          null, // No specific user initiated this (system action)
          'balance_reconciliation', // Updated action name to match enum
          'Vendor',
          vendor._id,
          {
            vendorName: vendor.businessName,
            storedBalance,
            expectedBalance,
            discrepancy,
            totalEarnings,
            totalPayouts,
            commissionRate,
            reconciliationDate: new Date().toISOString()
          }
        );
      }
    }
  } catch (error) {
    console.error('Error during vendor balance reconciliation:', error);
  }
  console.log('Vendor balance reconciliation job finished.');
};