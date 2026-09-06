const jwt = require('jsonwebtoken');
const { get, hashPassword } = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'athass_medisync_jwt_super_secret_key_2026';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

async function verifyLogin(username, password) {
  const user = await get('SELECT * FROM admin_users WHERE username = ?', [username]);
  if (!user) return null;

  const inputHash = hashPassword(password, user.salt);
  if (inputHash === user.password_hash) {
    return { id: user.id, username: user.username };
  }
  return null;
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
}

module.exports = {
  generateToken,
  verifyLogin,
  requireAuth
};
