import dotenv from 'dotenv'; dotenv.config();   // Load Enviroment
import Discord from 'discord.js';               // The discord client
import Datastore from 'nedb';

const db = new Datastore({ filename: 'storage.db', autoload: true });
const discord = new Discord.Client();
const prefix = process.env.PREFIX || '$';


/** Listen to message reaction. We have to do this manually because d.js ignores uncached messages */
discord.on('raw', async (packet) => {
    if (packet.t === 'MESSAGE_REACTION_ADD' || packet.t === 'MESSAGE_REACTION_REMOVE') {
       console.log('packet', packet.d);

        //Get the event
        let event = packet.d;

        //Create the search
        let search = {};
        if (event.emoji.id != null) {
            search = { 
                message_id: event.message_id,
                "emoji.id": event.emoji.id,
            };
        } else {
            search = {
                message_id: event.message_id,
                "emoji.name": event.emoji.name,
                "emoji.id": null,
            };
        }

        const guild = await discord.guilds.fetch(event.guild_id);
        const member = guild.member(event.user_id);

        //Find the role
        db.find(search, async function(err, docs) {
            if (docs.length > 0) {
                const doc = docs[0];

                //Either add or remove a role based of the found document
                if (packet.t === 'MESSAGE_REACTION_ADD') {
                    console.log('Awarded user role', event.member, doc);
                    await member.roles.add(doc.role_id);
                } else {
                    console.log('Removed user role', event.member, doc);
                    await member.roles.remove(doc.role_id);
                }
            }
        });
    }
});


/** When we have a message, look for links on the message */
discord.on('message', async (msg) => {
    if (msg.author.bot) return;

    //We could try a command framework, but there is like 2 commands
    if (msg.content.startsWith(`${prefix}create`)) {
        
        try {
            /** Step 1: wait for the reaction */
            await msg.reply('**Reaction Builder**\nThis will take 2 steps, reacting and then assigning a role.\n1. Please react to the message. This will be set as the reaction button.');
            const reaction = await new Promise((resolve, reject) => {
                timeout(20 * 1000, reject);

                let listener = async (packet) => {
                    console.log('packet', packet);
                    if (packet.t === 'MESSAGE_REACTION_ADD') {
                        if (packet.d.user_id == msg.author.id) {
                            console.log('should resolve', packet.d);
                            discord.removeListener('raw', listener);
                            resolve(packet.d);
                        }
                    }
                }
                discord.on('raw', listener);
            });

            //Step 2: wait for the role
            await msg.reply('2. Please give yourself the role you wish for the reaction to be.');
            const role = await new Promise((resolve, reject) => {
                timeout(20 * 1000, reject);
                let listener= async (oldMember, member) => {
                    if (oldMember.id == msg.author.id) {
                        let diff = member.roles.cache.difference(oldMember.roles.cache);
                        if (diff.size == 1) {
                            discord.removeListener('guildMemberUpdate', listener);
                            resolve(diff.first());
                        }
                    }
                }
                discord.on('guildMemberUpdate', listener);
            });

            //Insert to the DB record
            db.insert({
                guild_id: msg.guild.id,
                channel_id: reaction.channel_id,
                message_id: reaction.message_id,
                role_id: role.id,
                emoji: reaction.emoji
            });

            //All done!
            await msg.reply("Reaction role all setup!");
        }catch(e) {
            await msg.reply("Im sorry, but im afraid i cannot do that\n" + e.message);
        }
    }
});

discord.on('guildMemberUpdate', (oldMember, member) => {
    let diff = member.roles.cache.difference(oldMember.roles.cache);
    if(diff.size == 1) {
        console.log('diff', diff);
    }
});

/** Creates a Timeout that will expire and call the reject function.
 * Useful for promises
 */
function timeout(time, reject) {
    let to = setTimeout(() => { clearTimeout(to); reject(`Exceeded time limit.`); }, time);
    return to;
}

discord.login(process.env.TOKEN);