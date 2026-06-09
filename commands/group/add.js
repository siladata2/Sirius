export async function initializeAutoJoin(sock) {}

const addCommand = {
    name: 'add',
    alias: ['invite'],
    ownerOnly: true,
    async execute(sock, msg, args, prefix, ctx) {
        const chatId = msg.key.remoteJid;
        if (!args[0]) { await sock.sendMessage(chatId, { text: `Usage: ${prefix}add <number>` }, { quoted: msg }); return; }
        try {
            const jid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            await sock.groupParticipantsUpdate(chatId, [jid], 'add');
            await sock.sendMessage(chatId, { text: `✅ Added ${args[0]}` }, { quoted: msg });
        } catch (e) { await sock.sendMessage(chatId, { text: `❌ Failed: ${e.message}` }, { quoted: msg }); }
    }
};

export default addCommand;