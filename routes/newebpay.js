const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const qs = require("qs");
require("dotenv").config();

const MerchantID = process.env.MERCHANT_ID;
const HashKey = process.env.HASH_KEY;
const HashIV = process.env.HASH_IV;
const NewebPayEnv = (process.env.NEWEBPAY_ENV || "test").toLowerCase();
console.log("MerchantID:", MerchantID);
const PayGateWay =
  NewebPayEnv === "production"
    ? "https://core.newebpay.com/MPG/mpg_gateway"
    : "https://ccore.newebpay.com/MPG/mpg_gateway";

function hasRequiredConfig() {
  return Boolean(MerchantID && HashKey && HashIV);
}

// AES
function encryptAES(data) {
  const querystring = require("querystring");
  const enc = querystring.stringify(data);
  const cipher = crypto.createCipheriv("aes-256-cbc", HashKey, HashIV);
  let encrypted = cipher.update(enc, "utf8", "hex");
  encrypted += cipher.final("hex");

  return encrypted;
}
// SHA256
function shaEncrypt(data) {
  return crypto
    .createHash("sha256")
    .update(`HashKey=${HashKey}&${data}&HashIV=${HashIV}`)
    .digest("hex")
    .toUpperCase();
}

router.post("/createOrder", (req, res) => {
  const { name, phone, email, address, total, items } = req.body;

  if (!hasRequiredConfig()) {
    return res.status(500).json({
      message: "NewebPay 設定不完整",
    });
  }

  const orderNo = "ES" + Date.now();

  const data = {
    RespondType: "JSON",
    TimeStamp: Math.floor(Date.now() / 1000),
    Version: "2.0",
    MerchantOrderNo: orderNo,
    Amt: Number(total),
    ItemDesc: items || "佑奕設計訂單",
    Email: email,
  };

  const TradeInfo = encryptAES(data);
  const TradeSha = shaEncrypt(TradeInfo);

  res.json({
    MerchantID,
    TradeInfo,
    TradeSha,
    PayGateWay,
    Version: "2.0",
    orderNo,
  });
});

module.exports = router;
