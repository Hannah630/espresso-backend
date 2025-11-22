const express = require("express");
const qs = require("qs");
const { aesEncrypt, shaEncrypt } = require("../utils/newebpay-crypto");

const router = express.Router();

const MERCHANT_ID = process.env.MERCHANT_ID;
const HASH_KEY = process.env.HASH_KEY;
const HASH_IV = process.env.HASH_IV;

// 建立付款交易
router.post("/pay", (req, res) => {
  const { amount, email } = req.body;

  if (!amount) {
    return res.status(400).json({ error: "缺少金額" });
  }

  const orderNo = "LD" + Date.now();

  const data = {
    MerchantID: MERCHANT_ID,
    RespondType: "JSON",
    TimeStamp: Math.floor(Date.now() / 1000),
    Version: "2.0",
    MerchantOrderNo: orderNo,
    Amt: amount,
    ItemDesc: "佑奕設計購物訂單",
    Email: email || "test@test.com",
    ReturnURL: `${process.env.BASE_URL}/api/newebpay/callback`,
    ClientBackURL: `${process.env.BASE_URL}/thankyou`,
  };

  const TradeInfo = aesEncrypt(qs.stringify(data), HASH_KEY, HASH_IV);
  const TradeSha = shaEncrypt(TradeInfo, HASH_KEY, HASH_IV);

  const paymentUrl = `https://core.newebpay.com/MPG/mpg_gateway?MerchantID=${MERCHANT_ID}&TradeInfo=${TradeInfo}&TradeSha=${TradeSha}&Version=2.0`;

  res.json({ paymentUrl });
});

// 藍新通知 callback
router.post("/callback", (req, res) => {
  console.log("=== 藍新付款回傳 data ===");
  console.log(req.body);
  res.status(200).send("OK");
});

module.exports = router;
