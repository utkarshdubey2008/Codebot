const TelegramBot = require('node-telegram-bot-api');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

// Replace with your actual credentials from .env
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME;

// Initialize Telegram Bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Initialize MongoDB Client
const client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });

// Connect to MongoDB
client.connect().then(() => {
  console.log('Connected successfully to MongoDB');
}).catch(err => console.error('MongoDB connection error:', err));

const db = client.db(DB_NAME);
const codesCollection = db.collection('codes');
const usersCollection = db.collection('users');

// Helper function to check if a user is an admin
const isAdmin = async (userId) => {
  const user = await usersCollection.findOne({ userId, isAdmin: true });
  return !!user;
};

// Command: /start
bot.onText(/\/start(?:\s+(\S+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const uniqueId = match[1];

  if (uniqueId) {
    // User accessed via a unique link
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
    } else {
      bot.sendMessage(chatId, 'Invalid or expired link.');
    }
  } else {
    // General start message
    bot.sendMessage(chatId, 'Welcome! Use the provided links to access specific codes.');
  }
});

// Command: /add_code (admin-only)
bot.onText(/\/add_code\s+(\S+)\s+(.+)\s+```([\s\S]+)```/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!(await isAdmin(userId))) {
    bot.sendMessage(chatId, 'You are not authorized to add codes.');
    return;
  }

  const language = match[1];
  const description = match[2];
  const markdown = match[3];

  const result = await codesCollection.insertOne({
    language,
    description,
    markdown,
    createdBy: msg.from.username,
    accessCount: 0,
  });

  const uniqueId = result.insertedId.toString();
  const startLink = `https://t.me/${bot.username}?start=${uniqueId}`;

  bot.sendMessage(chatId, `Code added successfully! Share this link:\n${startLink}`);
});

// Command: /broadcast (admin-only)
bot.onText(/\/broadcast\s+([\s\S]+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!(await isAdmin(userId))) {
    bot.sendMessage(chatId, 'You are not authorized to broadcast messages.');
    return;
  }

  const message = match[1];
  const users = await usersCollection.find().toArray();

  users.forEach((user) => {
    bot.sendMessage(user.userId, message).catch((error) => {
      // Handle errors (e.g., user blocked the bot)
      console.error(`Failed to send message to ${user.userId}: ${error.message}`);
    });
  });

  bot.sendMessage(chatId, 'Broadcast sent successfully!');
});

// Command: /stats (admin-only)
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!(await isAdmin(userId))) {
    bot.sendMessage(chatId, 'You are not authorized to view stats.');
    return;
  }

  const totalUsers = await usersCollection.countDocuments();
  const totalCodes = await codesCollection.countDocuments();

  bot.sendMessage(
    chatId,
    `📊 *Bot Statistics*:\n\n👥 Total Users: ${totalUsers}\n📂 Total Codes: ${totalCodes}`,
    { parse_mode: 'Markdown' }
  );
});

// Log new users
bot.on('message', async (msg) => {
  const userId = msg.from.id;
  const username = msg.from.username;

  const user = await usersCollection.findOne({ userId });
  if (!user) {
    await usersCollection.insertOne({
      userId,
      username,
      isAdmin: false,
    });
  }
});
