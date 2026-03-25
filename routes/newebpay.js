const express = require("express");
const router = express.Router();
const crypto = require("crypto");
require("dotenv").config();

const pendingOrders = new Map();
const emailedOrders = new Set();

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

function cleanupPendingOrders() {
  const expiredAt = Date.now() - 24 * 60 * 60 * 1000;

  pendingOrders.forEach((order, orderNo) => {
    if (order.createdAt < expiredAt) {
      pendingOrders.delete(orderNo);
      emailedOrders.delete(orderNo);
    }
  });
}

function decryptTradeInfo(tradeInfo, hashKey, hashIV) {
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(hashKey, "utf8"),
    Buffer.from(hashIV, "utf8"),
  );

  let decrypted = decipher.update(`${tradeInfo || ""}`, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return Object.fromEntries(new URLSearchParams(decrypted));
}

function parseResultPayload(result) {
  if (!result) {
    return {};
  }

  if (typeof result === "object") {
    return result;
  }

  if (typeof result !== "string") {
    return {};
  }

  try {
    return JSON.parse(result);
  } catch {
    return Object.fromEntries(new URLSearchParams(result));
  }
}

function parseNewebPayCallback(body, config) {
  const parsedResult = parseResultPayload(body.Result);
  const decryptedTradeInfo = body.TradeInfo
    ? decryptTradeInfo(body.TradeInfo, config.hashKey, config.hashIV)
    : {};

  return {
    status: `${body.Status || parsedResult.Status || decryptedTradeInfo.Status || ""}`,
    result: {
      ...decryptedTradeInfo,
      ...parsedResult,
      MerchantOrderNo:
        parsedResult.MerchantOrderNo ||
        decryptedTradeInfo.MerchantOrderNo ||
        body.MerchantOrderNo ||
        "",
      Amt: parsedResult.Amt || decryptedTradeInfo.Amt || body.Amt || "",
      TradeNo:
        parsedResult.TradeNo ||
        decryptedTradeInfo.TradeNo ||
        body.TradeNo ||
        "",
      PayTime:
        parsedResult.PayTime ||
        decryptedTradeInfo.PayTime ||
        body.PayTime ||
        "",
    },
  };
}

async function sendMerchantOrderEmail(order, paymentResult) {
  const publicKey = (process.env.EMAILJS_PUBLIC_KEY || "").trim();
  const serviceId = (process.env.EMAILJS_SERVICE_ID || "").trim();
  const templateId = (process.env.EMAILJS_TEMPLATE_ID || "").trim();

  if (!publicKey || !serviceId || !templateId) {
    console.warn("略過商家寄信：EmailJS 設定不完整");
    return;
  }

  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: {
        name: order.name,
        phone: order.phone,
        email: order.email,
        address: order.address,
        total: order.total,
        items: order.items,
        orderNo: order.orderNo,
        merchantOrderNo: paymentResult.MerchantOrderNo || order.orderNo,
        tradeNo: paymentResult.TradeNo || "",
        payTime: paymentResult.PayTime || "",
        paymentStatus: "SUCCESS",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`EmailJS 寄送失敗：${errorText || response.status}`);
  }
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

  cleanupPendingOrders();
  pendingOrders.set(orderNo, {
    orderNo,
    name,
    phone,
    email,
    address,
    total: Number(total),
    items: items || itemDesc,
    createdAt: Date.now(),
  });

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
  const config = getNewebPayConfig();

  if (!config.isValid) {
    return res.status(500).json({ received: false, message: config.message });
  }

  try {
    const callbackData = parseNewebPayCallback(req.body, config);
    const merchantOrderNo = callbackData.result.MerchantOrderNo;

    console.log("NewebPay ReturnURL callback:", callbackData);

    if (callbackData.status !== "SUCCESS" || !merchantOrderNo) {
      return res.status(200).json({ received: true, mailed: false });
    }

    if (emailedOrders.has(merchantOrderNo)) {
      return res
        .status(200)
        .json({ received: true, mailed: false, duplicate: true });
    }

    const order = pendingOrders.get(merchantOrderNo);

    if (!order) {
      console.warn("找不到待寄送訂單資料：", merchantOrderNo);
      return res
        .status(200)
        .json({ received: true, mailed: false, missingOrder: true });
    }

    sendMerchantOrderEmail(order, callbackData.result)
      .then(() => {
        emailedOrders.add(merchantOrderNo);
        pendingOrders.delete(merchantOrderNo);
        console.log("付款成功，已寄送商家通知：", merchantOrderNo);
      })
      .catch((error) => {
        console.error("付款成功但商家通知寄送失敗：", error);
      });

    res.status(200).json({ received: true, mailed: true });
  } catch (error) {
    console.error("NewebPay callback 處理失敗：", error);
    res.status(500).json({ received: false, message: error.message });
  }
});

module.exports = router;
