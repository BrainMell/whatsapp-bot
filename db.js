const mongoose = require('mongoose');
require('dotenv').config();

let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;

  while (!isConnected) {
    try {
      const conn = await mongoose.connect(process.env.MONGO_URI);
      console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
      isConnected = true;
      return;
    } catch (error) {
      console.error(`❌ Error connecting to MongoDB: ${error.message}`);
      console.log("🔁 Retrying in 5 seconds...");
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
};

module.exports = connectDB;
