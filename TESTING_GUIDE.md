# Testing Guide for Vendor Onboarding & Drink Creation

This guide will walk you through testing the vendor registration, onboarding, and drink creation process.

## Prerequisites

- API testing tool (Postman, Thunder Client, Insomnia, or curl)
- Your backend server running (usually on http://localhost:5000 or similar)

---

## Step 1: Register a Vendor

**Endpoint:** `POST /api/vendors/auth/register`

**Request Body:**
```json
{
  "businessName": "Test Night Club",
  "email": "testclub@example.com",
  "password": "password123"
}
```

**Expected Response (201):**
```json
{
  "message": "Vendor created successfully. Please verify your email with the OTP sent to your inbox",
  "vendor": {
    "_id": "vendor_id_here",
    "businessName": "Test Night Club",
    "email": "testclub@example.com",
    "role": "vendor",
    "isVerified": false,
    "isOnboarded": false
  }
}
```

**Save:** 
- ✅ The vendor email for the next step

---

## Step 2: Verify Vendor Email with OTP

**Endpoint:** `POST /api/vendors/auth/verify-otp`

**Request Body:**
```json
{
  "email": "testclub@example.com",
  "otp": "123456"
}
```

> **Note:** Check your email/console for the OTP code. If you're in development, the OTP might be logged to the console.

**Expected Response (200):**
```json
{
  "message": "Email verified successfully.",
  "_id": "vendor_id_here",
  "email": "testclub@example.com",
  "vendorType": null,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Save:** 
- ✅ The `token` - you'll need this for all subsequent requests

---

## Step 3: Login as Vendor (Alternative to Step 2)

If you already have a verified vendor account, you can login directly:

**Endpoint:** `POST /api/vendors/auth/login`

**Request Body:**
```json
{
  "email": "testclub@example.com",
  "password": "password123"
}
```

**Expected Response (200):**
```json
{
  "message": "Login successful.",
  "vendor": {
    "_id": "vendor_id_here",
    "businessName": "Test Night Club",
    "email": "testclub@example.com",
    "role": "vendor",
    "isVerified": true,
    "isOnboarded": false
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Save:** 
- ✅ The `token`
- ✅ The vendor `_id` (you'll need this as `clubId` when creating drinks)

---

## Step 4: Complete Vendor Onboarding

**Endpoint:** `POST /api/vendors/auth/onboard`

**Headers:**
```
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json
```

**Request Body (for Club Vendor):**
```json
{
  "vendorType": "club",
  "profileImages": ["https://example.com/club-image.jpg"],
  "address": "123 Party Street, Lagos, Nigeria",
  "phone": "+2348012345678",
  "businessDescription": "The hottest nightclub in town with amazing vibes and great music",
  "website": "https://testnightclub.com",
  "priceRange": 5000,
  "accountName": "Test Night Club Limited",
  "accountNumber": "0123456789",
  "bankName": "Access Bank",
  "bankCode": "044",
  "openingTime": "20:00",
  "closingTime": "04:00",
  "slots": 200,
  "categories": ["nightclub", "lounge", "bar"],
  "dressCode": ["smart casual", "formal"],
  "ageLimit": "18+",
  "offer": "Happy Hour: 50% off all drinks from 8pm-10pm"
}
```

**Expected Response (200):**
```json
{
  "message": "Onboarding completed successfully.",
  "vendor": {
    "_id": "vendor_id_here",
    "businessName": "Test Night Club",
    "email": "testclub@example.com",
    "isOnboarded": true,
    "vendorType": "club",
    "address": "123 Party Street, Lagos, Nigeria",
    "phone": "+2348012345678",
    ...
  }
}
```

**If you get an error:**
- ❌ `"Forbidden: Please complete vendor onboarding before accessing this resource."` - Make sure you're using the correct token from Step 2/3
- ❌ `"Cast to Number failed for value '18+'"` - This should now be fixed! If you still see it, the code changes weren't applied.
- ❌ `"Paystack error"` - Check your Paystack API key in `.env` file

---

## Step 5: Login Again (Get New Token)

After onboarding, login again to get a new token with `isOnboarded: true`:

**Endpoint:** `POST /api/vendors/auth/login`

**Request Body:**
```json
{
  "email": "testclub@example.com",
  "password": "password123"
}
```

**Expected Response (200):**
```json
{
  "message": "Login successful.",
  "vendor": {
    "_id": "vendor_id_here",
    "businessName": "Test Night Club",
    "isOnboarded": true,
    "vendorType": "club"
  },
  "token": "NEW_TOKEN_HERE"
}
```

**Save:** 
- ✅ The NEW `token` (this one has `isOnboarded: true`)

---

## Step 6: Create a Drink Category

**Endpoint:** `POST /api/drinks/categories`

**Headers:**
```
Authorization: Bearer YOUR_NEW_TOKEN_HERE
Content-Type: application/json
```

**Request Body:**
```json
{
  "clubId": "YOUR_VENDOR_ID_HERE",
  "name": "Cocktails",
  "description": "Premium mixed drinks",
  "icon": "🍹"
}
```

**Expected Response (201):**
```json
{
  "_id": "category_id_here",
  "clubId": "vendor_id_here",
  "name": "Cocktails",
  "description": "Premium mixed drinks",
  "icon": "🍹",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

**Save:** 
- ✅ The category `_id` for the next step

---

## Step 7: Create a Drink

**Endpoint:** `POST /api/drinks`

**Headers:**
```
Authorization: Bearer YOUR_NEW_TOKEN_HERE
Content-Type: application/json
```

**Request Body:**
```json
{
  "clubId": "YOUR_VENDOR_ID_HERE",
  "name": "Mojito",
  "category": "CATEGORY_ID_FROM_STEP_6",
  "volume": "500ml",
  "price": 2500,
  "quantity": 50,
  "images": ["https://example.com/mojito.jpg"],
  "status": "active",
  "showOnBookingScreen": true
}
```

**Expected Response (201):**
```json
{
  "_id": "drink_id_here",
  "clubId": "vendor_id_here",
  "name": "Mojito",
  "category": "category_id_here",
  "volume": "500ml",
  "price": 2500,
  "quantity": 50,
  "images": ["https://example.com/mojito.jpg"],
  "status": "active",
  "showOnBookingScreen": true,
  "addOns": [],
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

**Success!** 🎉 You've successfully created a drink!

**If you get errors:**
- ❌ `"Forbidden: Please complete vendor onboarding before accessing this resource."` - Use the NEW token from Step 5
- ❌ `"Forbidden: You can only create drinks for your own club."` - Make sure `clubId` matches your vendor `_id`
- ❌ `"Forbidden: You do not have the necessary role."` - Your token doesn't have the right role. Re-login.

---

## Step 8: Get All Drinks

**Endpoint:** `GET /api/drinks?clubId=YOUR_VENDOR_ID_HERE`

**Headers:**
```
Authorization: Bearer YOUR_TOKEN_HERE
```

**Expected Response (200):**
```json
{
  "total": 1,
  "page": 1,
  "limit": 10,
  "drinks": [
    {
      "_id": "drink_id_here",
      "clubId": "vendor_id_here",
      "name": "Mojito",
      "category": {
        "_id": "category_id_here",
        "name": "Cocktails"
      },
      "volume": "500ml",
      "price": 2500,
      "quantity": 50,
      "status": "active"
    }
  ]
}
```

---

## Step 9: Update a Drink

**Endpoint:** `PUT /api/drinks/DRINK_ID_HERE`

**Headers:**
```
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json
```

**Request Body:**
```json
{
  "price": 3000,
  "quantity": 75
}
```

**Expected Response (200):**
```json
{
  "_id": "drink_id_here",
  "name": "Mojito",
  "price": 3000,
  "quantity": 75,
  ...
}
```

---

## Common Errors & Solutions

### 1. "Forbidden: Please complete vendor onboarding before accessing this resource."
**Cause:** You're trying to access protected routes before completing onboarding.  
**Solution:** Complete Step 4 (onboarding) and then login again (Step 5) to get a new token.

### 2. "Cast to Number failed for value '18+' (type string) at path 'ageLimit'"
**Cause:** The old code couldn't handle the "+" symbol in ageLimit.  
**Solution:** This is now fixed! You can send "18+", "21+", or just "18", "21" - all will work.

### 3. "Forbidden: You can only create drinks for your own club."
**Cause:** The `clubId` in your request doesn't match your vendor `_id`.  
**Solution:** Use your vendor's `_id` as the `clubId` when creating drinks.

### 4. "Not authorized, token failed"
**Cause:** Your token is invalid or expired.  
**Solution:** Login again to get a fresh token.

### 5. "Paystack error"
**Cause:** Paystack API key is missing or invalid.  
**Solution:** Check your `.env` file has `PAYSTACK_SECRET_KEY=your_key_here`

---

## Quick Test Script (Using curl)

If you want to test quickly using command line, here's a complete script:

```bash
# 1. Register Vendor
curl -X POST http://localhost:5000/api/vendors/auth/register \
  -H "Content-Type: application/json" \
  -d '{"businessName":"Test Club","email":"test@club.com","password":"password123"}'

# 2. Verify OTP (replace OTP_CODE with actual OTP)
curl -X POST http://localhost:5000/api/vendors/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@club.com","otp":"OTP_CODE"}'

# 3. Onboard (replace YOUR_TOKEN and other values)
curl -X POST http://localhost:5000/api/vendors/auth/onboard \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vendorType":"club","address":"Test Address","phone":"+234801234567","businessDescription":"Test Club","accountName":"Test","accountNumber":"0123456789","bankName":"Test Bank","bankCode":"044","openingTime":"20:00","closingTime":"04:00","slots":100,"categories":["nightclub"],"dressCode":["casual"],"ageLimit":"18+","offer":"Test offer"}'

# 4. Login again
curl -X POST http://localhost:5000/api/vendors/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@club.com","password":"password123"}'

# 5. Create Drink Category (replace YOUR_TOKEN and VENDOR_ID)
curl -X POST http://localhost:5000/api/drinks/categories \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clubId":"VENDOR_ID","name":"Cocktails","description":"Mixed drinks"}'

# 6. Create Drink (replace YOUR_TOKEN, VENDOR_ID, and CATEGORY_ID)
curl -X POST http://localhost:5000/api/drinks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clubId":"VENDOR_ID","name":"Mojito","category":"CATEGORY_ID","volume":"500ml","price":2500,"quantity":50,"status":"active"}'
```

---

## Testing Checklist

- [ ] Step 1: Vendor registration works
- [ ] Step 2: OTP verification works
- [ ] Step 3: Login works and returns token
- [ ] Step 4: Onboarding works with "18+" ageLimit (no more casting error!)
- [ ] Step 5: Login after onboarding returns token with isOnboarded: true
- [ ] Step 6: Can create drink category
- [ ] Step 7: Can create drink (no more "Forbidden" error!)
- [ ] Step 8: Can retrieve drinks
- [ ] Step 9: Can update drink

---

## Need Help?

If something doesn't work:
1. Check the server console for error logs
2. Verify your `.env` file has all required variables
3. Make sure MongoDB is running
4. Ensure you're using the correct token in the Authorization header
5. Double-check that IDs (vendor ID, category ID) are correct

Happy Testing! 🚀
