const jwt = require('jsonwebtoken');

const generateToken = (userId, rememberMe = false) => {
  // Default expiration time from environment
  const defaultExpiration = process.env.JWT_EXPIRE || '7d';
  
  // If remember me is true, use longer expiration (30 days)
  // Otherwise use default expiration (typically 7 days)
  const expiration = rememberMe ? '30d' : defaultExpiration;
  
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: expiration }
  );
};

module.exports = generateToken;
