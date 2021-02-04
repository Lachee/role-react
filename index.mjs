import dotenv from 'dotenv'; dotenv.config();   // Load Enviroment
import Discord from 'discord.js';               // The discord client

const discord = new Discord.Client();
discord.login(process.env.TOKEN);