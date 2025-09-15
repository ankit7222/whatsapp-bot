const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// Load replies with hot-reload
let replies = {};

const loadReplies = () => {
  try {
    replies = JSON.parse(fs.readFileSync("replies.json", "utf8"));
    console.log("Replies loaded/updated.");
  } catch (err) {
    console.error("Error loading replies.json:", err);
  }
};

loadReplies();
fs.watch("replies.json", (eventType, filename) => {
  if (filename && eventType === "change") {
    console.log(`Detected change in ${filename}, reloading...`);
    loadReplies();
  }
});

// Environment variables
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Handle incoming messages
app.post("/webhook", async (req, res) => {
  const body = req.body;
  console.log("Incoming message:", JSON.stringify(body, null, 2));

  if (body.object) {
    body.entry.forEach(entry => {
      entry.changes.forEach(async change => {
        const message = change.value.messages?.[0];
        if (message) {
          const from = message.from;
          const text = message.text?.body?.toLowerCase() || "";
          let replyContent = "Sorry, I didn't understand that.";
          let replyType = "text";
          let matched = false;

          // Keyword match
          for (const key in replies) {
            const keywords = replies[key].keywords;
            if (keywords.some(word => text.includes(word.toLowerCase()))) {
              replyContent = replies[key].reply;
              replyType = replies[key].reply_type || "text";
              matched = true;
              break;
            }
          }

          // Button click
          const buttonId = message?.button?.payload || message?.interactive?.button_reply?.id;
          if (buttonId) {
            console.log(`Button clicked: ${buttonId}`);
            for (const key in replies) {
              const buttonResponses = replies[key].button_responses || {};
              if (buttonResponses[buttonId]) {
                const btnReply = buttonResponses[buttonId];
                replyType = btnReply.reply_type || "text";
                replyContent = btnReply.reply;
                matched = true;
                break;
              }
            }
          }

          // Log unknown messages
          if (!matched) {
            const logEntry = {
              from,
              text: text || buttonId,
              timestamp: new Date().toISOString()
            };
            fs.appendFile("unknown_messages.log", JSON.stringify(logEntry) + "\n", err => {
              if (err) console.error("Error logging unknown message:", err);
              else console.log("Unknown message logged.");
            });
          }

          // Send reply
          const headers = {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
          };

          try {
            if (replyType === "text") {
              await axios.post(
                `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
                { messaging_product: "whatsapp", to: from, text: { body: replyContent } },
                { headers }
              );
            } else if (replyType === "image") {
              await axios.post(
                `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
                { messaging_product: "whatsapp", to: from, type: "image", image: { link: replyContent.link, caption: replyContent.caption } },
                { headers }
              );
            } else if (replyType === "buttons") {
              await axios.post(
                `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
                {
                  messaging_product: "whatsapp",
                  to: from,
                  type: "interactive",
                  interactive: {
                    type: "button",
                    body: { text: replyContent.text },
                    action: { buttons: replyContent.buttons }
                  }
                },
                { headers }
              );
            }

            console.log("Reply sent:", replyContent);
          } catch (error) {
            console.error("Error sending reply:", error.response?.data || error.message);
          }
        }
      });
    });

    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));