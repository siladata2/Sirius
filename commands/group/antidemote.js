const antidemote = {
    name: 'antidemote',
    ownerOnly: true,
    async execute(sock, msg, args, prefix, ctx) {
        await sock.sendMessage(msg.key.remoteJid, { text: '🛡️ Anti-demote active' }, { quoted: msg });
    }
};

export default antidemote;