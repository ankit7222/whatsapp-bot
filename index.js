import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.json());

// Environment variables
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const headers = {
  Authorization: `Bearer ${WHATSAPP_TOKEN}`,
  "Content-Type": "application/json",
};

// In-memory storage
const userStates = {};
const userData = {};

// ✅ Send simple text
async function sendText(to, text) {
  await axios.post(
    `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      text: { body: text },
    },
    { headers }
  );
}

// ✅ Send welcome (image + Sell button + links)
async function sendWelcome(to) {
  // Company image + button
  await axios.post(
    `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        header: {
          type: "image",
          image: { link: "https://example.com/company-logo.jpg" }, // replace
        },
        body: {
          text: "🏢 Welcome to MyCompany!\n\nWe help you sell and evaluate apps professionally.",
        },
        action: {
          buttons: [{ type: "reply", reply: { id: "sell", title: "Sell" } }],
        },
      },
    },
    { headers }
  );

  // Links
  await sendText(
    to,
    "📊 Use our Valuation Calculator:\nhttps://yourdomain.com/valuation"
  );
  await sendText(to, "🌐 Visit our website:\nhttps://yourdomain.com");
}

// ✅ Ask revenue source
async function sendRevenueSourceQuestion(to) {
  await axios.post(
    `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "What is the source of your revenue?" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "inapp", title: "In-App Revenue" } },
            { type: "reply", reply: { id: "subscription", title: "Subscription Revenue" } },
            { type: "reply", reply: { id: "ads", title: "Ad Revenue" } },
            { type: "reply", reply: { id: "all", title: "All of them" } },
          ],
        },
      },
    },
    { headers }
  );
}

// ✅ Handle webhook
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object) {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    if (message) {
      const from = message.from;
      const text = message.text?.body;
      const button = message.interactive?.button_reply;

      // Handle button clicks
      if (button) {
        const choice = button.id;

        if (choice === "sell") {
          userStates[from] = "revenue_source";
          await sendRevenueSourceQuestion(from);
        } else if (["inapp", "subscription", "ads", "all"].includes(choice)) {
          userData[from] = { revenueSource: choice };
          userStates[from] = "marketing";
          await sendText(
            from,
            "Have you done any marketing spends in the last 12 months? (Yes/No)"
          );
        }
      }

      // Handle free text
      if (text) {
        const lower = text.toLowerCase();

        if (lower.includes("hi") || lower.includes("hello")) {
          await sendWelcome(from);
        } else if (lower.includes("sell")) {
          userStates[from] = "revenue_source";
          await sendRevenueSourceQuestion(from);
        } else if (lower.includes("valuation")) {
          await sendText(
            from,
            "📊 Use our Valuation Calculator:\nhttps://yourdomain.com/valuation"
          );
        } else if (lower.includes("website")) {
          await sendText(
            from,
            "🌐 Visit our website:\nhttps://yourdomain.com"
          );
        } else {
          // Questionnaire states
          switch (userStates[from]) {
            case "marketing":
              userData[from].marketingSpends = text;
              userStates[from] = "dau";
              await sendText(from, "What is your DAU (Daily Active Users)?");
              break;

            case "dau":
              userData[from].dau = text;
              userStates[from] = "mau";
              await sendText(from, "What is your MAU (Monthly Active Users)?");
              break;

            case "mau":
              userData[from].mau = text;
              userStates[from] = "retention_day1";
              await sendText(from, "What is your Day 1 retention rate?");
              break;

            case "retention_day1":
              userData[from].retentionD1 = text;
              userStates[from] = "retention_day7";
              await sendText(from, "What is your Day 7 retention rate?");
              break;

            case "retention_day7":
              userData[from].retentionD7 = text;
              userStates[from] = "retention_day30";
              await sendText(from, "What is your Day 30 retention rate?");
              break;

            case "retention_day30":
              userData[from].retentionD30 = text;
              userStates[from] = "done";

              const summary = `
✅ App Summary:
- Revenue Source: ${userData[from].revenueSource}
- Marketing Spends: ${userData[from].marketingSpends}
- DAU: ${userData[from].dau}
- MAU: ${userData[from].mau}
- Retention:
   • Day 1: ${userData[from].retentionD1}
   • Day 7: ${userData[from].retentionD7}
   • Day 30: ${userData[from].retentionD30}
              `;

              await sendText(from, summary);
              break;
          }
        }
      }
    }
  }

  res.sendStatus(200);
});

// ✅ Webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token && mode === "subscribe" && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
