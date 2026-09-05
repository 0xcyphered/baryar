const { fail } = require('../utils/httpError');
const { pickFields } = require('../utils/pickFields');

const PROFILE_FIELDS = ['name', 'email', 'nationalId'];

function publicUser(user) {
  return {
    id: user._id.toString(),
    phone: user.phone,
    name: user.name || '',
    email: user.email || '',
    nationalId: user.nationalId || '',
    roles: user.roles,
    status: user.status,
    phoneVerifiedAt: user.phoneVerifiedAt,
  };
}

async function updateMe({ user, body }) {
  if (!user) fail('unauthorized');
  const fields = pickFields(body, PROFILE_FIELDS);
  if (Object.keys(fields).length === 0) fail('validation_error');
  if (fields.email !== undefined && typeof fields.email !== 'string') fail('validation_error');
  if (fields.name !== undefined && typeof fields.name !== 'string') fail('validation_error');
  if (fields.nationalId !== undefined && typeof fields.nationalId !== 'string') fail('validation_error');
  // Empty string is allowed (clear the field). Trim. Email is lowercased by the schema.
  if (fields.name !== undefined) fields.name = fields.name.trim();
  if (fields.email !== undefined) fields.email = fields.email.trim();
  if (fields.nationalId !== undefined) fields.nationalId = fields.nationalId.trim();
  Object.assign(user, fields);
  await user.save();
  return user;
}

module.exports = { PROFILE_FIELDS, publicUser, updateMe };
