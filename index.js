import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// ================== CONFIG ==================
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const MY_NUMBER = process.env.MY_NUMBER;

// ================== STATE ==================
let user_states = {};
let user_answers = {};

// ================== HELPERS ==================
async function sendMessage(to, message) {
  await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      ...message
    })
  });
}

async function sendText(to, text) {
  return sendMessage(to, { text: { body: text } });
}

// Send greeting with image and buttons
async function sendImageWithButtons(to) {
  // 1️⃣ Send Image with caption
  await sendMessage(to, {
    type: "image",
    image: {
      link: "https://www.kalagato.ai/logo.png", // <-- Replace with your image link
      caption: "👋 Welcome to KalaGato!\nWe help you sell and evauluate apps professionaly.\n\nChoose an option below 👇"
    }
  });

  // 2️⃣ Send buttons
  await sendMessage(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "Please select one option:" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "sell", title: "📱 Sell" } },
          { type: "reply", reply: { id: "valuation", title: "📊 Valuation Calculator" } },
          { type: "reply", reply: { id: "website", title: "🌐 Visit Website" } }
        ]
      }
    }
  });
}

// ================== BUTTON HANDLER ==================
async function handleButton(from, buttonId) {
  if (buttonId === "sell") {
    user_states[from] = "app_name";
    user_answers[from] = {};
    await sendText(from, "📱 Please provide your App Name:");

  } else if (buttonId === "valuation") {
    await sendText(from, "📊 Use our valuation calculator: https://www.kalagato.ai/app-valuation-calculator");

  } else if (buttonId === "website") {
    await sendText(from, "🌐 Visit our website: https://www.kalagato.ai/");
  }
}

// Revenue source buttons
async function handleRevenueButton(from, buttonId) {
  const map = { inapp: "In-App Purchases", subs: "Subscriptions", ads: "Ad Revenue", all: "All Sources" };
  user_answers[from].revenue = map[buttonId];
  user_states[from] = "marketing_spend";
  await sendMessage(from, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "📢 Have you done any marketing spends in the last 12 months?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "marketing_yes", title: "Yes" } },
          { type: "reply", reply: { id: "marketing_no", title: "No" } }
        ]
      }
    }
  });
}

// ================== TEXT HANDLER ==================
async function handleText(from, text) {
  if (!user_states[from]) {
    return sendImageWithButtons(from);
  }

  switch (user_states[from]) {
    case "app_name":
      user_answers[from].app_name = text;
      user_states[from] = "app_link";
      await sendText(from, "🔗 Please share your App Link (Play Store / App Store / Website):");
      break;

    case "app_link":
      user_answers[from].app_link = text;
      user_states[from] = "revenue";
      // Ask revenue source buttons
      await sendMessage(from, {
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: "💵 What is your main source of revenue?" },
          action: {
            buttons: [
              { type: "reply", reply: { id: "inapp", title: "In-App Purchases" } },
              { type: "reply", reply: { id: "subs", title: "Subscriptions" } },
              { type: "reply", reply: { id: "ads", title: "Ad Revenue" } },
              { type: "reply", reply: { id: "all", title: "All of them" } }
            ]
          }
        }
      });
      break;

    case "marketing_amount":
      user_answers[from].marketing_spend = text;
      user_states[from] = "dau";
      await sendText(from, "👥 What is your DAU (Daily Active Users)?");
      break;

    case "dau":
      user_answers[from].dau = text;
      user_states[from] = "mau";
      await sendText(from, "👥 What is your MAU (Monthly Active Users)?");
      break;

    case "mau":
      user_answers[from].mau = text;
      user_states[from] = "retention";
      await sendText(from, "📊 Please provide your retention rates (Day 1, Day 7, Day 30):");
      break;

    case "retention":
      user_answers[from].retention = text;
      user_states[from] = "done";
      await summarizeResponses(from);
      break;

    case "marketing_spend":
      if (text.toLowerCase() === "yes") {
        user_states[from] = "marketing_amount";
        await sendText(from, "💰 How much did you spend on marketing in the last 12 months?");
      } else {
        user_answers[from].marketing_spend = "No";
        user_states[from] = "dau";
        await sendText(from, "👥 What is your DAU (Daily Active Users)?");
      }
      break;

    default:
      await sendImageWithButtons(from);
      break;
  }
}

// ================== SUMMARY ==================
async function summarizeResponses(user) {
  const answers = user_answers[user];
  const summary = `
📋 *Seller Info Summary*
- App Name: ${answers.app_name}
- App Link: ${answers.app_link}
- Revenue Source: ${answers.revenue}
- Marketing Spend: ${answers.marketing_spend}
- DAU: ${answers.dau}
- MAU: ${answers.mau}
- Retention: ${answers.retention}
`;

  await sendText(user, "✅ Thank you! Here’s your summary:\n" + summary);

  if (MY_NUMBER) {
    await sendText(MY_NUMBER, "📥 New Lead Received:\n" + summary);
  }
}

// ================== WEBHOOKS ==================
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

app.post("/webhook", async (req, res) => {
  const data = req.body;

  if (data.object === "whatsapp_business_account") {
    for (const entry of data.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        const messages = value.messages || [];
        for (const msg of messages) {
          const from = msg.from;

          if (msg.type === "text") {
            await handleText(from, msg.text.body);
          } else if (msg.type === "interactive") {
            const buttonId = msg.interactive.button_reply.id;
            if (["sell", "valuation", "website"].includes(buttonId)) {
              await handleButton(from, buttonId);
            } else {
              await handleRevenueButton(from, buttonId);
            }
          }
        }
      }
    }
  }
  res.sendStatus(200);
});

// ================== START SERVER ==================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server is running on port " + PORT));
