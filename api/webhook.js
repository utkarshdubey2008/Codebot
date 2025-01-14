require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { MongoClient, ObjectId } = require('mongodb');
const assert = require('assert');

// Replace with your actual credentials
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'telegram_bot';
const ADMIN_IDS = [7758708579, 2009509228];

// Initialize MongoDB Client
const client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });

// Initialize Telegram Bot with webhook
const bot = new TelegramBot(BOT_TOKEN);
bot.setWebHook(`${process.env.VERCEL_URL}/api/webhook`);

const db = client.db(DB_NAME);
const codesCollection = db.collection('codes');
const usersCollection = db.collection('users');

// Helper function to check if a user is an admin
const isAdmin = async (userId) => {
  return ADMIN_IDS.includes(userId);
};

// Handle incoming updates from Telegram
async function handleUpdate(req, res) {
  try {
    const update = req.body;

    if (update.message) {
      const chatId = update.message.chat.id;
      const userId = update.message.from.id;

      if (update.message.text) {
        const text = update.message.text;

        if (text.startsWith('/start')) {
          const uniqueId = text.split(' ')[1];

          if (uniqueId) {
            // Access code by ID
            const code = await codesCollection.findOne({ _id: new ObjectId(uniqueId) });

            if (code) {
              // Increment access count
              await codesCollection.updateOne(
                { _id: new ObjectId(uniqueId) },
                { $inc: { accessCount: 1 } }
              );

              // Send the code details
              bot.sendMessage(
                chatId,
                `*Language:* ${code.language}\n*Description:* ${code.description}\n\n${code.markdown}`,
                { parse_mode: 'Markdown' }
              );

              // Send any attached image (if exists)
              if (code.image) {
                bot.sendPhoto(chatId, code.image);
              }
            } else {
              bot.sendMessage(chatId, 'Invalid or expired link.');
            }
          } else {
            bot.sendMessage(chatId, 'Welcome! Use the provided links to access specific codes.');
          }
        }

        // Add other commands here such as /add_code, /delete_code, etc.
        // Example for adding a new code (admin only)
        if (text.startsWith('/add_code')) {
          if (!await isAdmin(userId)) {
            bot.sendMessage(chatId, 'You are not authorized to add codes.');
            return;
          }

          const parts = text.split('```');
          if (parts.length === 3) {
            const language = parts[0].split(' ')[1];
            const description = parts[1].trim();
            const markdown = parts[2].trim();

            const result = await codesCollection.insertOne({
              language,
              description,
              markdown,
              accessCount: 0,
              createdBy: update.message.from.username,
            });

            const uniqueId = result.insertedId.toString();
            const startLink = `https://t.me/${bot.username}?start=${uniqueId}`;

            bot.sendMessage(chatId, `Code added successfully! Share this link:\n${startLink}`);
          }
        }
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error occurred while processing update.');
  }
}

// Export handler function for Vercel
module.exports = handleUpdate;
