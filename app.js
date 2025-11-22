require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/emailjs-config', (req, res) => {
  res.json({
    publicKey: process.env.EMAILJS_PUBLIC_KEY,
    serviceId: process.env.EMAILJS_SERVICE_ID,
    templateId: process.env.EMAILJS_TEMPLATE_ID
  });
});
const newebpayRoute = require("./routes/newebpay");
app.use("/api/newebpay", newebpayRoute);

app.get("/", (req, res) => {
  res.send("Backend is running!");
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

