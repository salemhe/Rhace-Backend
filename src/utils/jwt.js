import jwt from "jsonwebtoken";

export const generateToken = (id, role, isOnboarded, vendorType ) => {
  return jwt.sign({ id, role, isOnboarded, vendorType }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

export const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};
