const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'rockin-antigravity-space-music-secret-key-1337';

function authenticateToken(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      res.clearCookie('token');
      return res.status(403).json({ error: 'Session expired. Please login again.' });
    }
    req.user = decoded; // { id, username }
    next();
  });
}

function optionalAuthenticate(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (!err) {
      req.user = decoded;
    }
    next();
  });
}

module.exports = {
  JWT_SECRET,
  authenticateToken,
  optionalAuthenticate
};
