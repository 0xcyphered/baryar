function requireRole(role) {
  return function requireRoleMiddleware(req, res, next) {
    if (!req.user || !Array.isArray(req.user.roles) || !req.user.roles.includes(role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    return next();
  };
}

const requireDriver = requireRole('driver');
const requireCargoOwner = requireRole('cargo_owner');

module.exports = { requireRole, requireDriver, requireCargoOwner };
