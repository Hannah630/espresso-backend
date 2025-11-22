const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const qs = require("qs");

// ====== 🔥 NewebPay 測試金流參數 ======
const MerchantID = "MS000000000";
const HashKey = "12345678901234567890123456789012";  // 32 字元
const HashIV = "1234567890123456";                   // 16 字元
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
  return crypto.createHash("sha256").update(plainText).digest("hex").toUpperCase();
}

// ====== 建立訂單 API ======
router.post("/createOrder", (req, res) => {
  const { name, phone, email, address, total, items } = req.body;

  const orderNo = "ES" + Date.now();  // 訂單編號

  const data = {
    MerchantID,
    RespondType: "JSON",
    TimeStamp: Math.floor(Date.now() / 1000),
    Version: "2.0",
    MerchantOrderNo: orderNo,
    Amt: Number(total),
    ItemDesc: "佑奕設計商品訂單",
    Email: email
  };

  // AES 加密
  const TradeInfo = encryptAES(data);

  // SHA 簽章
  const TradeSha = shaEncrypt(TradeInfo);

  // 回傳給前端
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


// const express = require("express");
// const router = express.Router();
// const crypto = require("crypto");
// require("dotenv").config();

// const MERCHANT_ID = process.env.MERCHANT_ID;
// const HASH_KEY = process.env.HASH_KEY;
// const HASH_IV = process.env.HASH_IV;

// // 加密
// function encryptTradeInfo(data) {
//   const encode = encodeURIComponent(data)
//     .replace(/%20/g, '+');

//   const cipher = crypto.createCipheriv('aes-256-cbc', HASH_KEY, HASH_IV);
//   let encrypted = cipher.update(encode, 'utf8', 'hex');
//   encrypted += cipher.final('hex');
//   return encrypted;
// }

// // SHA256
// function sha256Encrypt(encryptedData) {
//   const sha = crypto.createHash('sha256');
//   const plainText = `HashKey=${HASH_KEY}&${encryptedData}&HashIV=${HASH_IV}`;
//   return sha.update(plainText).digest('hex').toUpperCase();
// }

// router.post("/createOrder", (req, res) => {
//   const { name, phone, email, address, total, items } = req.body;

//   const orderNo = "ES" + Date.now();
//   const amount = parseInt(total, 10);

//   const raw = `MerchantID=${MERCHANT_ID}&RespondType=JSON&TimeStamp=${Math.floor(Date.now() / 1000)}&Version=2.0&MerchantOrderNo=${orderNo}&Amt=${amount}&ItemDesc=Espresso商品&Email=${email}`;

//   const TradeInfo = encryptTradeInfo(raw);
//   const TradeSha = sha256Encrypt(`TradeInfo=${TradeInfo}`);

//   res.json({
//     MerchantID: MERCHANT_ID,
//     TradeInfo,
//     TradeSha,
//     Version: "2.0",
//     PayGateWay: "https://ccore.newebpay.com/MPG/mpg_gateway",
//     orderNo
//   });
// });

// module.exports = router;
