'use client';

import { useState, useEffect } from 'react';

export default function MusicPlayer() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [nowPlaying, setNowPlaying] = useState('Nothing is playing right now');
  const [channels, setChannels] = useState<any[]>([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  
  // 🌟 ตัวแปรใหม่สำหรับเก็บรายการคิวเพลง
  const [queue, setQueue] = useState<string[]>([]);

  // ⚠️ เปลี่ยนเป็น ID เซิร์ฟเวอร์ดิสคอทของคุณตรงนี้
  const GUILD_ID = "589149920737361951"; 
  // แบบใหม่ (ให้ใช้ตัวนี้แทน):
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

  const scanChannels = async () => {
    setIsScanning(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/channels/${GUILD_ID}`);
      const data = await res.json();
      setChannels(data);
      if (data.length > 0 && !selectedChannel) setSelectedChannel(data[0].id);
    } catch (err) {} finally { setIsScanning(false); }
  };

  // 🌟 ฟังก์ชันดึงคิวเพลงแบบอัตโนมัติ
  const fetchQueue = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/queue/${GUILD_ID}`);
      const data = await res.json();
      if (data.nowPlaying) {
        setNowPlaying(data.nowPlaying);
      } else {
        setNowPlaying('Nothing is playing right now');
      }
      setQueue(data.queue || []);
    } catch (error) {}
  };

  // ดึงข้อมูลคิวทุกๆ 2 วินาที (เพื่อให้หน้าเว็บอัปเดตตลอดเวลา)
  useEffect(() => { 
    scanChannels(); 
    fetchQueue();
    const interval = setInterval(fetchQueue, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleChannelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newChannel = e.target.value;
    setSelectedChannel(newChannel);
    if (nowPlaying !== 'Nothing is playing right now') {
        await fetch(`${BACKEND_URL}/api/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId: GUILD_ID, voiceChannelId: newChannel }),
        });
    }
  };

  const handlePlay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query || !selectedChannel) return;
    setStatus('Loading...');
    try {
      await fetch(`${BACKEND_URL}/api/play`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, guildId: GUILD_ID, voiceChannelId: selectedChannel }),
      });
      setIsPlaying(true);
      setStatus('');
      setQuery(''); 
      fetchQueue(); // โหลดคิวทันทีที่สั่งเล่น
    } catch (error) { setStatus('Error connecting to bot'); }
  };
  
  const handleStop = async () => {
  await fetch(`${BACKEND_URL}/api/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guildId: GUILD_ID })
  });
};

  const controlPlayer = async (action: string) => {
    try {
      await fetch(`${BACKEND_URL}/api/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: GUILD_ID }),
      });
      fetchQueue();
    } catch (error) {}
  };

  return (
    <main className="min-h-screen bg-neutral-900 text-white flex flex-col items-center py-12 px-6 font-sans">
      <h1 className="text-4xl font-bold mb-8 tracking-tight">Tai <span className="text-red-500">Phayu</span></h1>
      
      {/* ส่วนเครื่องเล่นหลัก */}
      <div className="bg-neutral-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-neutral-700">
        <div className="mb-6 text-center">
          <p className="text-sm text-neutral-400 uppercase tracking-widest mb-2">Now Playing</p>
          <div className="text-xl font-semibold text-neutral-100 truncate">{nowPlaying}</div>
          <div className="text-sm text-red-400 mt-2 h-4">{status}</div>
        </div>

        <div className="flex justify-center items-center gap-6 mb-6">
          <button onClick={() => controlPlayer('previous')} className="text-2xl text-neutral-400 hover:text-white transition">⏮</button>
          <button onClick={() => { setIsPlaying(!isPlaying); controlPlayer(isPlaying ? 'pause' : 'resume'); }} className="text-4xl text-white hover:scale-110 transition drop-shadow-md">
            {isPlaying ? '⏸' : '▶️'}
          </button>
          <button onClick={() => controlPlayer('skip')} className="text-2xl text-neutral-400 hover:text-white transition">⏭</button>
        </div>

        <form onSubmit={handlePlay} className="flex flex-col gap-4">
          <div className="flex gap-2">
            <select value={selectedChannel} onChange={handleChannelChange} className="flex-grow px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-600 focus:outline-none focus:border-red-500 text-white">
              {channels.length === 0 && <option>No voice channels found</option>}
              {channels.map(channel => <option key={channel.id} value={channel.id}>🔊 {channel.name}</option>)}
            </select>
            <button type="button" onClick={scanChannels} disabled={isScanning} className="bg-neutral-700 hover:bg-neutral-600 px-4 rounded-lg font-bold transition">
              {isScanning ? '⏳' : '🔄'}
            </button>
          </div>

          <input type="text" placeholder="Search song or paste YouTube/Spotify Playlist URL..." value={query} onChange={(e) => setQuery(e.target.value)} className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-600 focus:outline-none focus:border-red-500 text-white" />
          <button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg transition-colors">Play / Add to Queue</button>
        </form>
      </div>

      {/* 🌟 กระดานแสดงคิวเพลง (Queue Board) */}
      <div className="bg-neutral-800 p-6 rounded-2xl shadow-xl w-full max-w-md border border-neutral-700 mt-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-neutral-200">Up Next 🎧</h2>
          {queue.length > 0 && (
            <button onClick={() => controlPlayer('clear')} className="text-xs bg-neutral-700 hover:bg-red-600 px-3 py-1 rounded text-white transition">
              Clear Queue
            </button>
          )}
        </div>
        
        {queue.length === 0 ? (
          <p className="text-neutral-500 text-sm text-center py-4">Queue is empty</p>
        ) : (
          <ul className="max-h-48 overflow-y-auto pr-2 space-y-2">
            {queue.map((song, index) => (
              <li key={index} className="text-sm bg-neutral-900 p-3 rounded border border-neutral-700 truncate text-neutral-300">
                <span className="text-neutral-500 mr-3">{index + 1}.</span>{song}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}