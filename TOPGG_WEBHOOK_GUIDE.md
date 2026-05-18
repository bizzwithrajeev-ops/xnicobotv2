# Top.gg Webhook Secret Guide

This guide explains how to handle the `TOPGG_WEBHOOK_SECRET` for your bot's vote notifications.

## 1. What is the Webhook Secret?
The webhook secret is a private "password" shared between Top.gg and your bot. When Top.gg sends a vote notification to your bot, it includes this secret so your bot knows the request is actually from Top.gg and not a hacker.

## 2. How to get your Secret from Top.gg
1. Go to the [Top.gg Developer Portal](https://top.gg/api/docs).
2. Find your bot's **Webhooks** section.
3. You will see a field for **Webhook URL** (e.g., `https://your-bot-link.repl.co/topgg-webhook`).
4. Look for the **Authorization/Secret** field. You can create your own secret here (any strong password).
5. Copy this secret.

## 3. How to get your Webhook URL

A Webhook URL is simply the address where your bot is listening for messages. It follows this format:
`http://<YOUR_IP_OR_DOMAIN>:<PORT>/topgg-webhook`

### If you are on Replit:
Your URL looks like this:
`https://b9290b79-e19c-42f2-9599-a5e62a41d3a9-00-f6u5du0j0g6g.pike.replit.dev/topgg-webhook`

### If you are on a VPS (another hosting site):
1. **Get your IP Address**: This is the "Public IP" provided by your host (e.g., `123.45.67.89`).
2. **Choose a Port**: Your bot usually runs on a specific port (like `5000` or `3000`).
3. **Open the Port**: You must make sure your VPS firewall (like `ufw`) allows traffic on that port.
4. **Final URL**: Your URL will be:
   `http://123.45.67.89:5000/topgg-webhook`

> **Pro Tip:** If you buy a domain (like `mybot.com`) and point it to your VPS, your URL would be `http://mybot.com:5000/topgg-webhook`.

---

## 4. How to add it to your Hosting

### On Replit (Current Host)
1. Open the **Secrets** tab (lock icon) in the Replit sidebar.
2. Add a new secret:
   - **Key:** `TOPGG_WEBHOOK_SECRET`
   - **Value:** Paste the secret you copied from Top.gg.

### On a VPS or other Hosting
1. Create a `.env` file in your project's root folder.
2. Add the following line:
   ```env
   TOPGG_WEBHOOK_SECRET=your_copied_secret_here
   ```
3. Ensure your `index.js` or main file uses `dotenv` to load these variables.

## 4. How the code uses it
The bot checks every incoming vote notification against this secret. If they don't match, the bot ignores the vote for security reasons.

```javascript
// Example of how it is checked in the code
const secret = process.env.TOPGG_WEBHOOK_SECRET;
if (req.headers.authorization !== secret) {
    return res.status(403).send('Unauthorized');
}
```

## 5. Moving to another Host?
If you move your files to a VPS, simply copy your `.env` file (or create a new one) with the same secret. You don't need to change anything on Top.gg as long as you update the **Webhook URL** to your new server's address.
