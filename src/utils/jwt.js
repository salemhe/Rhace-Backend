import jwt from "jsonwebtoken";

export const generateAccessToken = (id, role, isOnboarded, vendorType) => {
  return jwt.sign(
    { id, role, isOnboarded, vendorType },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "7d" },
  );
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
};