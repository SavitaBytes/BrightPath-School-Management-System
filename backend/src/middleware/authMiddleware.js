
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

// Verify that the user has a valid login token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Access denied. Please log in first."
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured.");
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, isActive: true }
    });
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "This account is unavailable."
      });
    }
    req.user = { userId: user.id, role: user.role };
    next();
  } catch (error) {
    if (error.message === "JWT_SECRET is not configured.") {
      console.error(error.message);
      return res.status(500).json({
        success: false,
        message: "Authentication is not configured."
      });
    }
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired login token."
      });
    }
    console.error("Authentication lookup failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to verify your account."
    });
  }
};

// Check whether the logged-in user has an allowed role
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource."
      });
    }

    next();
  };
};

module.exports = {
  authenticateToken,
  authorizeRoles
};
