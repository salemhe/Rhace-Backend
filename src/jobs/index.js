import { updateBookingStatuses, notifyUpcomingBookings, processRefunds } from '../utils/bookingScheduler.js';
import { reconcileVendorBalances } from './reconciliation.job.js';
import { startExchangeRateJob } from "./exchangeRate.job.js";
import { startTopVendorsJob } from "./topVendors.job.js";

/**
 * Starts all scheduled jobs for the application.
 * @param {number} intervalMinutes - The interval in minutes to run the jobs.
 */
export const startAllSchedulers = (intervalMinutes = 60) => {
  console.log('Initializing all application schedulers...');

  const runAllTasks = () => {
    console.log('Running all scheduled tasks...');
    // Booking-related tasks
    updateBookingStatuses();
    notifyUpcomingBookings();
    processRefunds();

    // Financial tasks
    reconcileVendorBalances();

    // Emit dashboard updates after tasks complete
    if (global.io) {
      global.io.emit('dashboard_refresh', { message: 'Scheduled tasks completed, refresh dashboard data' });
    }
  };

  // Run all tasks immediately on startup
  runAllTasks();

  // Then run them at the specified interval
  setInterval(runAllTasks, intervalMinutes * 60 * 1000);

  console.log(`All schedulers started, set to run every ${intervalMinutes} minutes.`);

  // Start cron jobs
  startExchangeRateJob();
  startTopVendorsJob();
};
