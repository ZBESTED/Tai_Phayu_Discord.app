require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { Manager } = require('moonlink.js'); 
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

client.moonlink = new Manager({
    nodes: [{
        host: "lavalinkv4.serenetia.com", 
        port: 443, 
        secure: true, 
        password: "https://seretia.link/discord"
    }],
    options: {
        clientName: "TaiPhayu"
    },
    send: (guildId, payload) => { 
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
    }
});

// API: ดึงรายชื่อห้อง (แก้ไขให้ fetch สดจาก Discord)
app.get('/api/channels/:guildId', async (req, res) => {
    try {
        const guild = await client.guilds.fetch(req.params.guildId);
        if (!guild) return res.status(404).json({ error: "Discord server not found" });
        
        const channels = await guild.channels.fetch();
        const voiceChannels = channels
            .filter(c => c && c.type === 2)
            .map(c => ({ id: c.id, name: c.name }));
        
        res.json(voiceChannels);
    } catch (error) {
        console.error("Fetch Channels Error:", error);
        res.status(500).json({ error: "Failed to fetch channels" });
    }
});

// API: เล่นเพลง
app.post('/api/play', async (req, res) => {
    const { query, guildId, voiceChannelId } = req.body;
    if (!query || !guildId || !voiceChannelId) return res.status(400).json({ error: "Missing data" });

    try {
        let player = client.moonlink.players.get(guildId);
        if (!player) {
            player = client.moonlink.players.create({ guildId, voiceChannelId, textChannelId: voiceChannelId });
        } else if (player.voiceChannelId !== voiceChannelId) {
            player.voiceChannelId = voiceChannelId;
            player.connect({ setDeaf: true, setMute: false });
        }

        if (!player.connected) {
            player.connect({ setDeaf: true, setMute: false });
            await new Promise(r => setTimeout(r, 1000)); 
        }

        const searchRes = await client.moonlink.search({ query: query, source: "youtube" });
        const loadType = searchRes.loadType ? searchRes.loadType.toUpperCase() : '';

        if (loadType === 'EMPTY' || loadType === 'NO_MATCHES' || (loadType === 'SEARCH_RESULT' && (!searchRes.tracks || searchRes.tracks.length === 0))) {
            return res.status(404).json({ error: "Song not found" });
        }

        const isPlaylist = loadType.includes('PLAYLIST');
        const tracks = isPlaylist ? (searchRes.tracks || searchRes.data || []) : [searchRes.tracks?.[0] || searchRes.data?.[0]];
        
        tracks.filter(t => t).forEach(t => player.queue.add(t));

        if (!player.playing) player.play();
        res.status(200).json({ message: "Success" });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// API: ควบคุมเครื่องเล่น
app.post('/api/pause', (req, res) => {
    const player = client.moonlink.players.get(req.body.guildId);
    if (player) { player.pause(true); res.json({ message: "paused" }); }
});
app.post('/api/resume', (req, res) => {
    const player = client.moonlink.players.get(req.body.guildId);
    if (player) { player.pause(false); res.json({ message: "resumed" }); }
});
app.post('/api/skip', (req, res) => {
    const player = client.moonlink.players.get(req.body.guildId);
    if (player) { player.skip(); res.json({ message: "skipped" }); }
});
app.post('/api/previous', (req, res) => {
    const player = client.moonlink.players.get(req.body.guildId);
    if (player) { player.seek(0); res.json({ message: "replayed" }); }
});
app.post('/api/move', (req, res) => {
    const player = client.moonlink.players.get(req.body.guildId);
    if (player) { 
        player.voiceChannelId = req.body.voiceChannelId; 
        player.connect({ setDeaf: true, setMute: false }); 
        res.json({ message: "moved" }); 
    }
});

// API: คิวเพลง
app.get('/api/queue/:guildId', (req, res) => {
    const player = client.moonlink.players.get(req.params.guildId);
    if (!player) return res.json({ nowPlaying: null, queue: [] });
    res.json({ 
        nowPlaying: player.current?.title || player.current?.info?.title, 
        queue: player.queue.map(t => t.title || t.info?.title) 
    });
});

app.post('/api/clear', (req, res) => {
    const player = client.moonlink.players.get(req.body.guildId);
    if (player) player.queue.clear();
    res.json({ message: "cleared" });
});

// ... (โค้ดส่วนต้นเหมือนเดิมจนถึงส่วน API ควบคุม)

// API: หยุดเล่นเพลงและออกจากห้อง (เพิ่มใหม่)
app.post('/api/stop', (req, res) => {
    const player = client.moonlink.players.get(req.body.guildId);
    if (player) {
        player.queue.clear(); // ล้างคิว
        player.stop();       // หยุดเล่น
        player.destroy();    // บอทออกจากห้อง
        res.json({ message: "stopped and left" });
    } else {
        res.status(404).json({ error: "No active player" });
    }
});

// API: ล้างคิวเพลง (คงเดิม)
app.post('/api/clear', (req, res) => {
    const player = client.moonlink.players.get(req.body.guildId);
    if (player) {
        player.queue.clear();
        res.json({ message: "cleared" });
    } else {
        res.status(404).json({ error: "No player found" });
    }
});



// ระบบ AUTOPLAY
client.moonlink.on('trackEnd', async (player, track) => {
    if (player.queue.size === 0) {
        try {
            const author = track.author || track.info?.author || "Official Music";
            const searchRes = await client.moonlink.search({ query: `${author} top tracks`, source: "youtube" });
            const tracks = searchRes.tracks || searchRes.data || [];
            if (tracks.length > 0) {
                player.queue.add(tracks[Math.floor(Math.random() * Math.min(3, tracks.length))]);
                player.play();
            }
        } catch (error) {}
    }
});

client.on('raw', (data) => client.moonlink.packetUpdate(data));
client.once('clientReady', () => {
    console.log(`✅ TaiPhayu พร้อมใช้งาน!`);
    client.moonlink.init(client.user.id);
});
client.moonlink.on('nodeCreate', () => console.log(`✅ Lavalink Node connected!`));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Backend API running on port ${PORT}`));
client.login(process.env.DISCORD_TOKEN);