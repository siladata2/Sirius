const banCommand = {
    name: 'ban',
    alias: ['kick', 'remove'],
    ownerOnly: true,
    async execute(sock, msg, args, prefix, ctx) {
        const chatId = msg.key.remoteJid;
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const target = mentioned[0] || (args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);
        if (!target) { await sock.sendMessage(chatId, { text: `Usage: ${prefix}ban @mention` }, { quoted: msg }); return; }
        try {
            await sock.groupParticipantsUpdate(chatId, [target], 'remove');
            await sock.sendMessage(chatId, { text: `✅ Removed ${target.split('@')[0]}` }, { quoted: msg });
        } catch (e) { await sock.sendMessage(chatId, { text: `❌ Failed: ${e.message}` }, { quoted: msg }); }
    }
};

export default banCommand;