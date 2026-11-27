const PLATFORM = '网易云音乐（匿名版）';

function songId(value) {
    const id = String(value == null ? '' : value).trim();
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
        throw new Error('歌曲 ID 必须是安全范围内的正整数');
    }
    return id;
}

function toMusicItem(song) {
    if (!song || typeof song.name !== 'string' || !song.name.trim()) {
        throw new Error('网易云歌曲数据结构异常');
    }
    const album = song.al || song.album || {};
    const artists = song.ar || song.artists || [];
    if (!Array.isArray(artists)) throw new Error('网易云歌手数据结构异常');
    const duration = Number(song.dt ?? song.duration ?? 0);
    return {
        platform: PLATFORM,
        id: songId(song.id),
        title: song.name,
        artist: artists.map(function (artist) { return artist.name; }).filter(Boolean).join(' / '),
        album: album.name || '',
        artwork: album.picUrl || '',
        duration: Number.isFinite(duration) && duration >= 0 ? duration / 1000 : 0,
    };
}

function importedSongId(value) {
    const input = String(value == null ? '' : value).trim();
    if (/^\d+$/.test(input)) return songId(input);
    let url;
    try {
        url = new URL(input);
    } catch (_) {
        throw new Error('请输入歌曲 ID 或网易云歌曲完整链接');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== 'music.163.com' ||
        url.username || url.password || url.port) {
        throw new Error('仅支持 music.163.com 的歌曲完整链接，短链接请先在浏览器展开');
    }
    // 官网分享链接可将 /song?id=... 放在 hash 中。
    if (url.hash.startsWith('#/')) url = new URL(url.hash.slice(1), url.origin);
    if (!['/song', '/m/song'].includes(url.pathname)) {
        throw new Error('链接不是网易云歌曲链接');
    }
    return songId(url.searchParams.get('id'));
}

module.exports = { PLATFORM, songId, toMusicItem, importedSongId };
