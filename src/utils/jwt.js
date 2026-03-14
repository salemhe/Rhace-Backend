import jwt from 'jsonwebtoken';

export const generateAccessToken = (id, role, isOnboarded, vendorType) => {
  return jwt.sign(
    { id, role, isOnboarded, vendorType },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );
};

export const generateRefreshToken = (id, role) => {
  return jwt.sign(
    { id, role },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
};

export const generateToken = (id, role, isOnboarded, vendorType ) => {
  return jwt.sign({ id, role, isOnboarded, vendorType }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

export const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};