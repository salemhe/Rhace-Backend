export const authorize = (roles = [], permissions = []) => {
  if (typeof roles === "string") {
    roles = [roles];
  }
  if (typeof permissions === "string") {
    permissions = [permissions];
  }

    return (req, res, next) => {
    // Assuming req.user is populated by the authentication middleware
    if (!req.user || !req.user.role) {
      console.log("Authorization failed: User or role not found", { user: req.user });
      return res.status(401).json({ message: "Unauthorized: User not authenticated or role not found." });
    }

    // Check roles
    if (roles.length && !roles.includes(req.user.role)) {
      console.log("Authorization failed: Role mismatch", { 
        userRole: req.user.role, 
        allowedRoles: roles,
        userId: req.user._id 
      });
      return res.status(403).json({ 
        message: "Forbidden: You do not have the necessary role.",
        yourRole: req.user.role,
        requiredRoles: roles
      });
    }

    // Check permissions
    if (permissions.length) {
      const userPermissions = req.user.permissions || [];
      const hasPermission = permissions.some(perm => userPermissions.includes(perm));
      if (!hasPermission) {
        return res.status(403).json({ message: "Forbidden: You do not have the necessary permissions." });
      }
    }

    // Authentication and authorization successful
    next();
  };
};
