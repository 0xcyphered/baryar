function normalizeIranPhone(input) {
  if (typeof input !== 'string') return null;
  const digits = input.replace(/[^\d]/g, '');
  let national = digits;
  if (digits.startsWith('0098')) national = digits.slice(4);
  else if (digits.startsWith('98')) national = digits.slice(2);
  if (national.startsWith('0')) national = national.slice(1);
  if (!/^9\d{9}$/.test(national)) return null;
  return `+98${national}`;
}

module.exports = { normalizeIranPhone };
