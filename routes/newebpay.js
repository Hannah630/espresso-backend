const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const qs = require("qs");

const MerchantID = "MS000000000";
const HashKey = "12345678901234567890123456789012"; // 32 字
const HashIV = "1234567890123456"; // 16 字
const PayGateWay = "https://ccore.newebpay.com/MPG/mpg_gateway";

// ====== AES 加密 ======
function encryptAES(data) {
  const encData = qs.stringify(data);
  const cipher = crypto.createCipheriv("aes-256-cbc", HashKey, HashIV);
  let encrypted = cipher.update(encData, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

// ====== SHA256 Hash ======
function shaEncrypt(hexData) {
  const plainText = `HashKey=${HashKey}&${hexData}&HashIV=${HashIV}`;
  return crypto
    .createHash("sha256")
    .update(plainText)
    .digest("hex")
    .toUpperCase();
}

// ====== 建立訂單 API ======
router.post("/createOrder", (req, res) => {
  const { name, phone, email, address, total, items } = req.body;

  const orderNo = "ES" + Date.now(); // 訂單編號

  const data = {
    MerchantID,
    RespondType: "JSON",
    TimeStamp: Math.floor(Date.now() / 1000),
    Version: "2.0",
    MerchantOrderNo: orderNo,
    Amt: Number(total),
    ItemDesc: encodeURIComponent("佑奕設計商品訂單"),
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
