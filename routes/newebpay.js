const express = require("express");
const router = express.Router();
const crypto = require("crypto");
require("dotenv").config();

function getNewebPayConfig() {
  const merchantId = (process.env.MERCHANT_ID || "").trim();
  const hashKey = (process.env.HASH_KEY || "").trim();
  const hashIV = (process.env.HASH_IV || "").trim();
  const env = (process.env.NEWEBPAY_ENV || "").trim().toLowerCase();
  const version = (process.env.NEWEBPAY_VERSION || "2.0").trim();
  const returnUrl = (
    process.env.RETURN_URL ||
    (env === "production"
      ? "https://espresso-backend.onrender.com/api/newebpay/return"
      : "http://localhost:3000/api/newebpay/return")
  ).trim();

  if (!merchantId || !hashKey || !hashIV) {
    return {
      isValid: false,
      message: "NewebPay 設定不完整",
    };
  }

  if (Buffer.byteLength(hashKey, "utf8") !== 32) {
    return {
      isValid: false,
      message: "HASH_KEY 長度必須為 32 bytes",
    };
  }

  if (Buffer.byteLength(hashIV, "utf8") !== 16) {
    return {
      isValid: false,
      message: "HASH_IV 長度必須為 16 bytes",
    };
  }

  if (!["test", "production"].includes(env)) {
    return {
      isValid: false,
      message: "NEWEBPAY_ENV 必須為 test 或 production",
    };
  }

  if (env === "test" && merchantId.startsWith("MS")) {
    return {
      isValid: false,
      message:
        "正式商店代號不可使用測試閘道，請將 NEWEBPAY_ENV 設為 production",
    };
  }

  return {
    isValid: true,
    merchantId,
    hashKey,
    hashIV,
    version,
    returnUrl,
    gateway:
      env === "production"
        ? "https://core.newebpay.com/MPG/mpg_gateway"
        : "https://ccore.newebpay.com/MPG/mpg_gateway",
  };
}

function buildTradeInfoQuery(data) {
  const params = new URLSearchParams();

  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    params.append(key, `${value}`);
  });

  return params.toString();
}

// AES
function encryptAES(data, hashKey, hashIV) {
  const enc = buildTradeInfoQuery(data);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(hashKey, "utf8"),
    Buffer.from(hashIV, "utf8"),
  );
  let encrypted = cipher.update(enc, "utf8", "hex");
  encrypted += cipher.final("hex");

  return encrypted;
}
// SHA256
function shaEncrypt(data, hashKey, hashIV) {
  return crypto
    .createHash("sha256")
    .update(`HashKey=${hashKey}&${data}&HashIV=${hashIV}`)
    .digest("hex")
    .toUpperCase();
}

function buildItemDesc(items, orderNo) {
  const rawItems = `${items || ""}`.replace(/\s+/g, " ").trim();

  if (!rawItems) {
    return `Order ${orderNo}`;
  }

  if (/[^\x20-\x7E]/.test(rawItems)) {
    return `Order ${orderNo}`;
  }

  return rawItems.slice(0, 50);
}

router.post("/createOrder", (req, res) => {
  const { name, phone, email, address, total, items } = req.body;
  const config = getNewebPayConfig();

  if (!config.isValid) {
    return res.status(500).json({
      message: config.message,
    });
  }

  const orderNo = "ES" + Date.now();
  const itemDesc = buildItemDesc(items, orderNo);

  const data = {
    MerchantID: config.merchantId,
    RespondType: "JSON",
    TimeStamp: Math.floor(Date.now() / 1000),
    Version: config.version,
    MerchantOrderNo: orderNo,
    Amt: Number(total),
    ItemDesc: itemDesc,
    ReturnURL: config.returnUrl,
    Email: email,
  };

  const TradeInfo = encryptAES(data, config.hashKey, config.hashIV);
  const TradeSha = shaEncrypt(TradeInfo, config.hashKey, config.hashIV);

  const responsePayload = {
    MerchantID: config.merchantId,
    TradeInfo,
    TradeSha,
    PayGateWay: config.gateway,
    Version: config.version,
    orderNo,
  };

  if (config.version !== "1.6") {
    responsePayload.EncryptType = "1";
  }

  res.json(responsePayload);
});

router.post("/return", (req, res) => {
  console.log("NewebPay ReturnURL callback:", req.body);
  res.status(200).json({ received: true });
});

module.exports = router;
