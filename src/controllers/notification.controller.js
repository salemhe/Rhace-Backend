import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";
// import { Vendor } from "../models/vendor.model.js";
import { sendEmail } from "../services/mail.service.js";
// import { sendSMS } from "../services/sms.service.js";
// import { sendWhatsApp } from "../services/whatsapp.service.js";

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
export const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    const query = { user: req.user._id };
    if (status) query.status = status;

    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sort: { createdAt: -1 },
    };

    const notifications = await Notification.paginate(query, options);
    res.status(200).json(notifications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mark notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
export const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    notification.status = "read";
    await notification.save();

    res.status(200).json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mark all notifications as read
// @route   PATCH /api/notifications/mark-all-read
// @access  Private
export const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, status: "unread" },
      { status: "read" }
    );

    res.status(200).json({ message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private
export const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.status(200).json({ message: "Notification deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send notification to user
// @route   POST /api/notifications/send
// @access  Private (Admin)
export const sendNotification = async (req, res) => {
  try {
    const { userId, title, message, type, link, channels = ["in-app"] } = req.body;

    // Create in-app notification
    const notification = new Notification({
      user: userId,
      title,
      message,
      type,
      link,
    });
    await notification.save();

    // Send via other channels if specified
    if (channels.includes("email")) {
      const user = await User.findById(userId);
      if (user?.email) {
        await sendEmail(user.email, title, message);
      }
    }

    // if (channels.includes("sms")) {
    //   const user = await User.findById(userId);
    //   if (user?.phone) {
    //     await sendSMS(user.phone, message);
    //   }
    // }

    // if (channels.includes("whatsapp")) {
    //   const user = await User.findById(userId);
    //   if (user?.phone) {
    //     await sendWhatsApp(user.phone, message);
    //   }
    // }

    res.status(201).json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send bulk notifications
// @route   POST /api/notifications/bulk-send
// @access  Private (Admin)
export const sendBulkNotifications = async (req, res) => {
  try {
    const { userIds, title, message, type, link, channels = ["in-app"] } = req.body;

    const notifications = userIds.map((userId) => ({
      user: userId,
      title,
      message,
      type,
      link,
    }));

    await Notification.insertMany(notifications);

    // TODO: Implement bulk email/SMS/WhatsApp sending

    res.status(201).json({
      message: `Notifications sent to ${userIds.length} users`,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get notification templates
// @route   GET /api/notifications/templates
// @access  Private (Admin)
export const getNotificationTemplates = async (req, res) => {
  try {
    const templates = {
      RESERVATION: {
        CONFIRMED: {
          title: "Reservation Confirmed",
          message: "Your reservation for {date} at {time} has been confirmed.",
        },
        CANCELLED: {
          title: "Reservation Cancelled",
          message: "Your reservation for {date} at {time} has been cancelled.",
        },
        REMINDER: {
          title: "Reservation Reminder",
          message: "Don't forget your reservation tomorrow at {time}.",
        },
      },
      PAYMENT: {
        SUCCESSFUL: {
          title: "Payment Successful",
          message: "Your payment of {amount} has been processed successfully.",
        },
        FAILED: {
          title: "Payment Failed",
          message: "Your payment of {amount} could not be processed.",
        },
      },
      SECURITY: {
        LOGIN: {
          title: "New Login Detected",
          message: "A new login was detected from {location}.",
        },
        PASSWORD_RESET: {
          title: "Password Reset",
          message: "Your password has been successfully reset.",
        },
      },
      GENERAL: {
        WELCOME: {
          title: "Welcome to Rhace",
          message: "Welcome! Your account has been created successfully.",
        },
        PROMOTION: {
          title: "Special Offer",
          message: "Check out our latest promotions and discounts.",
        },
      },
      VENDOR: {
        APPROVED: {
          title: "Vendor Account Approved",
          message: "Congratulations! Your vendor account has been approved.",
        },
        REJECTED: {
          title: "Vendor Application Rejected",
          message: "Unfortunately, your vendor application was not approved.",
        },
      },
    };

    res.status(200).json(templates);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
