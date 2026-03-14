const safeSplit = (value = "", delimiter = "#") => {
  if (typeof value !== "string" || !value.includes(delimiter)) {
    return [null, null];
  }
  const parts = value
    .split(delimiter)
    .map((v) => (v === "" || v === "null" ? null : v));
  return [parts[0], parts[1]];
};
// Generate random alphanumeric user_id
function generateUserId(length = 10) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Generate numeric PIN
function generatePin(length = 6) {
  const digits = "0123456789";
  let pin = "";
  for (let i = 0; i < length; i++) {
    pin += digits.charAt(Math.floor(Math.random() * digits.length));
  }
  return pin;
}

export { safeSplit, generatePin, generateUserId };
