const NAME_PATTERN = /^[\p{L}][\p{L}\s.'-]*$/u
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidName(value = '') {
  const name = String(value).trim()
  return name.length >= 1 && name.length <= 100 && NAME_PATTERN.test(name)
}

export function isValidEmail(value = '') {
  const email = String(value).trim()
  return email.length <= 255 && EMAIL_PATTERN.test(email)
}

/**
 * Philippine mobile number: 11 digits starting with 09, or
 * +63/63 followed by 9 digits. Spaces, dashes, dots and parentheses are ignored.
 */
export function isValidPhone(value = '') {
  const raw = String(value).trim()
  if (!raw) return true
  if (!/^\+?[0-9\s\-().]+$/.test(raw)) return false
  const digits = raw.replace(/\D+/g, '')
  return /^09\d{9}$/.test(digits) || /^639\d{9}$/.test(digits)
}

export function isValidPassword(value = '') {
  const password = String(value)
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password)
}

export function requiredMessage(label) {
  return `${label} is required.`
}
