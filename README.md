# WhatsApp Bot for App Leads

This is a WhatsApp chatbot that helps collect app seller information. It sends an image greeting with buttons and guides the user through a questionnaire about their app.

---

## Features

- Sends an **intro image + company info** when a user first messages.
- **3 buttons**:  
  1. 📱 Sell → starts a questionnaire to collect app info  
  2. 📊 Valuation Calculator → replies with a link  
  3. 🌐 Visit Website → replies with your website link
- **Sell Questionnaire Flow**:  
  - App Name  
  - App Link  
  - Revenue Source (In-App / Subscription / Ads / All)  
  - Marketing Spend (Yes/No → if Yes, amount)  
  - DAU (Daily Active Users)  
  - MAU (Monthly Active Users)  
  - Retention rates (Day 1, 7, 30)  
- Sends a **summary to the user** and to your WhatsApp number (`MY_NUMBER`).

---

git clone https://github.com/ankit7222/whatsapp-bot.git
cd whatsapp-bot
