const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');
const connectDB = require('../db');

async function check() {
    await connectDB();
    const users = await User.find({}).limit(10); 
    console.log("SAMPLE USERS DATA:");
    users.forEach(user => {
        console.log(`\nID: ${user.userId}`);
        console.log(`Stats:`, user.stats);
    });
    process.exit(0);
}
check();
