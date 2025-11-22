const crypto = require("crypto");

exports.aesEncrypt = function (data, key, iv) {
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  cipher.setAutoPadding(true);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
};

exports.shaEncrypt = function (aesData, key, iv) {
  return crypto
    .createHash("sha256")
    .update(`HashKey=${key}&${aesData}&HashIV=${iv}`)
    .digest("hex")
    .toUpperCase();
};
