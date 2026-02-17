# TODO: Fix Vendor Access to Dashboard and Reservation Endpoints

## Tasks:
- [ ] 1. Add "vendor" role to reservation counters endpoint authorization
- [ ] 2. Modify dashboard controller to allow vendors access to relevant endpoints with vendor-specific data
  - [ ] getTodaysReservations - Allow vendors
  - [ ] getBookingTrends - Allow vendors
  - [ ] getKPIs - Allow vendors
  - [ ] getUpcomingReservations - Allow vendors
  - [ ] getRevenueTrends - Allow vendors
  - [ ] getVendorsEarnings - Allow vendors
  - [ ] getRecentTransactions - Allow vendors

## Changes:
1. src/routes/reservation.routes.js - Add "vendor" to authorize roles
2. src/controllers/dashboard.controller.js - Modify functions to check for vendor role and return vendor-specific data
