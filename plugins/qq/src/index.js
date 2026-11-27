const { get, zero, searchInput, clean, httpUrl, inputUrl, decodeBase64 } = require('../../shared/api');
const platform = 'QQ音乐（匿名版）';
const headers = { Referer: 'https://y.qq.com/' };
const size = 30;

function songMid(value) {
    const id = String(value || '');
    if (!/^[a-zA-Z0-9]{14}$/.test(id)) throw new Error('QQ 音乐 songmid 无效');
    return id;
}

function mapSong(song) {
    const id = songMid(song.songmid || song.mid);
    const album = song.album || {};
    const albumMid = song.albummid || album.mid;
    const title = clean(song.songname || song.title || song.name);
    if (!title || !Array.isArray(song.singer)) throw new Error('QQ 歌曲详情结构异常');
    return { platform, id, title,
        artist: song.singer.map(function (singer) { return clean(singer.name); }).join(' / '),
        album: clean(song.albumname || album.name), duration: Number(song.interval || 0),
        artwork: albumMid ? 'https://y.gtimg.cn/music/photo_new/T002R300x300M000' + albumMid + '.jpg' : '',
        mediaMid: song.media_mid || song.strMediaMid || (song.file && song.file.media_mid) || '',
    };
}

async function musicRequest(data) {
    return zero(await get('https://u.y.qq.com/cgi-bin/musicu.fcg', { data: JSON.stringify(data) }, headers));
}

async function detail(item) {
    const id = songMid(item.id);
    const result = await musicRequest({ songinfo: { module: 'music.pf_song_detail_svr',
        method: 'get_song_detail_yqq', param: { song_mid: id } } });
    const data = result.songinfo;
    const song = data && data.data && data.data.track_info;
    if (!data || data.code !== 0 || !song || songMid(song.mid) !== id) throw new Error('QQ 歌曲不存在或详情响应异常');
    return song;
}

async function getMusicInfo(item) { return mapSong(await detail(item)); }

function mapAlbum(album) {
    return { platform, id: songMid(album.albumMID), title: clean(album.albumName), artist: clean(album.singerName),
        artwork: 'https://y.gtimg.cn/music/photo_new/T002R300x300M000' + songMid(album.albumMID) + '.jpg',
        description: '', date: album.publicTime || '', worksNum: album.song_count };
}

async function getAlbumInfo(item, page = 1) {
    const id = songMid(item.id);
    if (!Number.isSafeInteger(page) || page < 1) throw new Error('专辑页码必须是从 1 开始的整数');
    if (page > 1) return { musicList: [], isEnd: true };
    const musicList = [];
    const seen = new Set();
    let total;
    do {
        const result = await musicRequest({ comm: { ct: 24, cv: 10000 }, albumSonglist: {
            module: 'music.musichallAlbum.AlbumSongList', method: 'GetAlbumSongList',
            param: { albumMid: id, albumID: 0, begin: musicList.length, num: 100, order: 2 } } });
        const response = result.albumSonglist;
        const data = response && response.data;
        if (!response || response.code !== 0 || !data || data.albumMid !== id || !Number.isSafeInteger(data.totalNum) ||
            data.totalNum < 0 || !Array.isArray(data.songList)) throw new Error('QQ 专辑详情响应异常');
        if (total === undefined) total = data.totalNum;
        if (total !== data.totalNum || (item.worksNum != null && item.worksNum !== total) ||
            (!data.songList.length && musicList.length < total)) throw new Error('QQ 专辑曲目缺失或数量变化');
        for (const entry of data.songList) {
            if (!entry.songInfo) throw new Error('QQ 专辑歌曲详情缺失');
            const song = mapSong(entry.songInfo);
            if (seen.has(song.id) || (entry.songInfo.album && entry.songInfo.album.mid !== id)) throw new Error('QQ 专辑曲目重复或归属异常');
            seen.add(song.id);
            musicList.push(song);
        }
        if (musicList.length > total) throw new Error('QQ 专辑曲目数量异常');
    } while (musicList.length < total);
    return { musicList, isEnd: true, albumItem: Object.assign({}, item, { platform, id, worksNum: total,
        title: item.title || (musicList[0] && musicList[0].album) || '', description: item.description || '' }) };
}

module.exports = {
    platform, version: '0.2.0', author: 'xiaogc', primaryKey: ['id'],
    srcUrl: 'https://raw.githubusercontent.com/xiaogc123/MusicFree/refs/heads/master/plugins/qq/dist/plugin.js',
    description: '歌曲与专辑搜索、完整专辑详情、标准音源、原文与翻译歌词、歌曲详情及单曲导入。受限歌曲不提供音源。',
    supportedSearchType: ['music', 'album'], defaultSearchType: 'music', cacheControl: 'no-cache',
    hints: { importMusicItem: ['支持 14 位 songmid 或 QQ 音乐官网单曲完整链接；短链接需先展开。'] },
    getMusicInfo,
    getAlbumInfo,
    async search(query, page, type) {
        query = searchInput(query, page, type, ['music', 'album']);
        if (!query) return { data: [], isEnd: true };
        const result = zero(await get('https://c.y.qq.com/soso/fcgi-bin/client_search_cp', {
            format: 'json', n: size, p: page, w: query, cr: 1, g_tk: 5381, t: type === 'album' ? 8 : 0,
        }, headers));
        const data = result.data && result.data[type === 'album' ? 'album' : 'song'];
        if (!data || !Array.isArray(data.list) || !Number.isFinite(Number(data.totalnum))) throw new Error('QQ 搜索响应结构异常');
        return { data: data.list.map(type === 'album' ? mapAlbum : mapSong), isEnd: data.list.length < size || page * size >= Number(data.totalnum) };
    },
    async getMediaSource(item, quality = 'standard') {
        if (quality !== 'standard') return null;
        const song = await detail(item);
        const file = song.file || {};
        if (!file.media_mid || Number(file.try_end) > 0 || Number(file.b_30s) > 0 || Number(file.e_30s) > 0 ||
            !song.pay || Number(song.pay.pay_play) !== 0) throw new Error('QQ 歌曲需要权限或仅提供试听');
        const id = songMid(song.mid);
        const result = await musicRequest({ req_0: { module: 'vkey.GetVkeyServer', method: 'CgiGetVkey',
            param: { filename: ['M500' + id + file.media_mid + '.mp3'], guid: '2796982635',
                songmid: [id], songtype: [0], uin: '0', loginflag: 1, platform: '20' } },
        comm: { uin: 0, format: 'json', ct: 19, cv: 0 } });
        const response = result.req_0;
        const data = response && response.data;
        if (!response || response.code !== 0 || !data || !Array.isArray(data.midurlinfo) || !Array.isArray(data.sip)) {
            throw new Error('QQ 音源响应异常');
        }
        const source = data.midurlinfo.find(function (source) { return source.songmid === id; });
        if (!source || source.result !== 0 || !source.purl || !/^M500/.test(source.purl)) throw new Error('QQ 未提供匿名完整音源');
        const base = data.sip.find(function (url) { return /^https:\/\//.test(url); }) || data.sip[0];
        return { url: httpUrl(new URL(source.purl, httpUrl(base)).toString()), headers, quality: 'standard' };
    },
    async getLyric(item) {
        const data = zero(await get('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg', {
            songmid: songMid(item.id), format: 'json', g_tk: 5381, loginUin: 0, hostUin: 0,
            inCharset: 'utf8', outCharset: 'utf-8', notice: 0, platform: 'yqq', needNewCode: 0,
        }, headers));
        if (typeof data.lyric !== 'string' || (data.trans != null && typeof data.trans !== 'string')) throw new Error('QQ 歌词响应结构异常');
        if (!data.lyric && !data.trans) return null;
        return { rawLrc: cleanLyric(decodeBase64(data.lyric)), translation: cleanLyric(decodeBase64(data.trans || '')) };
    },
    async importMusicItem(input) {
        let id = String(input || '').trim();
        if (!/^[a-zA-Z0-9]{14}$/.test(id)) {
            const url = inputUrl(id, ['y.qq.com']);
            const match = url.pathname.match(/\/(?:songDetail|song)\/([a-zA-Z0-9]{14})(?:\.html)?\/?$/);
            id = match ? match[1] : url.searchParams.get('songmid');
        }
        return getMusicInfo({ id: songMid(id) });
    },
};

function cleanLyric(text) {
    return text.replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#(\d+);/g,
        function (_, point) { return Number(point) <= 0x10ffff ? String.fromCodePoint(Number(point)) : ''; });
}
