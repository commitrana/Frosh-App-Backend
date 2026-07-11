const jwt = require('jsonwebtoken');
const Society = require('../models/Society');

// ============ MIDDLEWARE DEFINITIONS ============

// Middleware to verify society token
const authSociety = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required. Please login.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');
    
    if (decoded.role !== 'society') {
      return res.status(403).json({ error: 'Society access required.' });
    }

    const society = await Society.findById(decoded.id).select('-password');
    
    if (!society) {
      return res.status(401).json({ error: 'Society not found. Please login again.' });
    }

    req.society = society;
    req.token = token;
    next();
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token. Please login again.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please login again.' });
    }
    res.status(401).json({ error: 'Authentication failed.' });
  }
};

// Middleware to verify admin token
const authAdmin = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');
    
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    req.admin = decoded;
    req.token = token;
    next();
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired.' });
    }
    res.status(401).json({ error: 'Authentication failed.' });
  }
};

// Middleware to verify member token
const authMember = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');
    
    if (decoded.role !== 'member') {
      return res.status(403).json({ error: 'Member access required.' });
    }

    req.member = decoded;
    req.token = token;
    next();
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired.' });
    }
    res.status(401).json({ error: 'Authentication failed.' });
  }
};

// Middleware to verify student token
const authStudent = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Authentication required. Please login.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');

    if (decoded.role !== 'student') {
      return res.status(403).json({ error: 'Student access required.' });
    }

    req.student = decoded;
    req.token = token;
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token. Please login again.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please login again.' });
    }
    res.status(401).json({ error: 'Authentication failed.' });
  }
};

// Middleware to verify faculty token
const authFaculty = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required. Please login.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');
    
    if (decoded.role !== 'faculty') {
      return res.status(403).json({ error: 'Faculty access required.' });
    }

    req.faculty = decoded;
    req.token = token;
    next();
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token. Please login again.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please login again.' });
    }
    res.status(401).json({ error: 'Authentication failed.' });
  }
};

// ============ EXPORT ALL MIDDLEWARES ============
module.exports = { authSociety, authAdmin, authMember, authStudent, authFaculty };