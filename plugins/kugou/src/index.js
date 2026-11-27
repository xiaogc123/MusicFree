const { get, searchInput, clean, httpUrl, inputUrl, decodeBase64 } = require('../../shared/api');
const platform = '酷狗音乐（匿名版）';
const headers = { Referer: 'https://m.kugou.com/' };
const size = 30;

function hashId(value) {
    const hash = String(value || '').toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(hash)) throw new Error('酷狗歌曲 hash 无效');
    return hash;
}

function mapSong(song) {
    const id = hashId(song.FileHash || song.hash);
    const title = clean(song.SongName || song.songName);
    if (!title) throw new Error('酷狗歌曲详情缺少标题');
    return { platform, id, title, artist: clean(song.SingerName || song.author_name),
        album: clean(song.AlbumName || song.album_name),
        artwork: String(song.Image || song.album_img || song.imgUrl || '').replace('{size}', '240'),
        duration: Number(song.Duration || song.timeLength || 0) };
}

async function detail(item) {
    const id = hashId(item.id);
    const data = await get('https://m.kugou.com/app/i/getSongInfo.php', { cmd: 'playInfo', hash: id }, headers);
    if (!data || data.status !== 1 || Number(data.errcode) !== 0 || hashId(data.hash) !== id) {
        throw new Error('酷狗歌曲不存在、受限或详情响应异常');
    }
    return data;
}

async function getMusicInfo(item) { return mapSong(await detail(item)); }

function albumId(value) {
    const id = String(value || '');
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new Error('酷狗专辑 ID 无效');
    return id;
}

function mapAlbum(album) {
    if (!clean(album.albumname)) throw new Error('酷狗专辑缺少标题');
    return { platform, id: albumId(album.albumid), title: clean(album.albumname), artist: clean(album.singername),
        artwork: String(album.imgurl || '').replace('{size}', '240'), description: clean(album.intro),
        date: album.publishtime || '', worksNum: album.songcount };
}

async function albumRequest(method, params) {
    const result = await get('http://mobilecdn.kugou.com/api/v3/album/' + method, params, headers);
    if (!result || result.status !== 1 || Number(result.errcode) !== 0 || !result.data) throw new Error('酷狗专辑接口响应异常');
    return result.data;
}

async function getAlbumInfo(item, page = 1) {
    const id = albumId(item.id);
    if (!Number.isSafeInteger(page) || page < 1) throw new Error('专辑页码必须是从 1 开始的整数');
    if (page > 1) return { musicList: [], isEnd: true };
    const params = { albumid: id, version: 9108, area_code: 1 };
    const info = await albumRequest('info', params);
    if (String(info.albumid) !== id) throw new Error('酷狗专辑身份异常');
    const albumItem = mapAlbum(info);
    const musicList = [];
    const seen = new Set();
    let total;
    let current = 1;
    do {
        const data = await albumRequest('song', Object.assign({}, params, { page: current++, pagesize: 100 }));
        if (!Number.isSafeInteger(data.total) || data.total < 0 || !Array.isArray(data.info)) throw new Error('酷狗专辑曲目响应异常');
        if (total === undefined) total = data.total;
        if (total !== data.total || (item.worksNum != null && item.worksNum !== total) ||
            (!data.info.length && musicList.length < total)) throw new Error('酷狗专辑曲目缺失或数量变化');
        for (const song of data.info) {
            const songId = hashId(song.hash);
            if (seen.has(songId) || (song.album_id != null && String(song.album_id) !== id)) throw new Error('酷狗专辑曲目重复或归属异常');
            seen.add(songId);
            const filename = clean(song.filename);
            const split = filename.indexOf(' - ');
            const title = clean(song.songname) || (split >= 0 ? filename.slice(split + 3) : filename);
            if (!title) throw new Error('酷狗专辑曲目缺少标题');
            musicList.push({ platform, id: songId, title, artist: clean(song.singername) || (split >= 0 ? filename.slice(0, split) : albumItem.artist),
                album: albumItem.title, artwork: albumItem.artwork, duration: Number(song.duration || 0) });
        }
        if (musicList.length > total) throw new Error('酷狗专辑曲目数量异常');
    } while (musicList.length < total);
    // 详情的 songcount 在实际接口中可能为 0，以曲目接口 total 为准。
    albumItem.worksNum = total;
    return { musicList, albumItem, isEnd: true };
}

module.exports = {
    platform, version: '0.2.0', author: 'xiaogc', primaryKey: ['id'],
    srcUrl: 'https://raw.githubusercontent.com/xiaogc123/MusicFree/refs/heads/master/plugins/kugou/dist/plugin.js',
    description: '歌曲与专辑搜索、完整专辑详情、标准音源、LRC 歌词、歌曲详情和 hash 单曲导入。受限或试听歌曲不可播放。',
    supportedSearchType: ['music', 'album'], defaultSearchType: 'music', cacheControl: 'no-cache',
    hints: { importMusicItem: ['支持 32 位歌曲 hash 或包含 hash 的酷狗官网歌曲链接；短链接需先展开。'] },
    getMusicInfo,
    getAlbumInfo,
    async search(query, page, type) {
        query = searchInput(query, page, type, ['music', 'album']);
        if (!query) return { data: [], isEnd: true };
        if (type === 'album') {
            const result = await get('http://mobilecdn.kugou.com/api/v3/search/album', {
                keyword: query, format: 'json', page, pagesize: size,
            }, headers);
            const data = result && result.data;
            if (!result || result.status !== 1 || Number(result.errcode) !== 0 || !data ||
                !Array.isArray(data.info) || !Number.isSafeInteger(data.total) || data.total < 0) throw new Error('酷狗专辑搜索响应异常');
            return { data: data.info.map(mapAlbum), isEnd: data.info.length < size || page * size >= data.total };
        }
        const result = await get('https://songsearch.kugou.com/song_search_v2', {
            keyword: query, platform: 'WebFilter', format: 'json', page, pagesize: size,
            userid: -1, clientver: '', tag: 'em', filter: 2, iscorrection: 1, privilege_filter: 0,
        }, headers);
        const data = result && result.data;
        if (result.status !== 1 || !data || !Array.isArray(data.lists) || !Number.isFinite(Number(data.total))) {
            throw new Error('酷狗搜索响应结构异常');
        }
        return { data: data.lists.map(mapSong), isEnd: data.lists.length < size || page * size >= Number(data.total) };
    },
    async getMediaSource(item, quality = 'standard') {
        if (quality !== 'standard') return null;
        const data = await detail(item);
        if (!data.url || Number(data.pay_type) !== 0 || data.is_free_part || data.freePart || data.free_trial_info ||
            (Number(item.duration) > 0 && Number(data.timeLength) + 2 < Number(item.duration))) {
            throw new Error('酷狗未提供匿名完整音源或仅提供试听');
        }
        return { url: httpUrl(data.url), headers, quality: 'standard' };
    },
    async getLyric(item) {
        const data = await get('https://krcs.kugou.com/search', {
            ver: 1, client: 'mobi', hash: hashId(item.id), duration: Math.round(Number(item.duration || 0) * 1000), album_audio_id: '',
        }, headers);
        if (!data || data.status !== 200 || !Array.isArray(data.candidates)) throw new Error('酷狗歌词搜索响应异常');
        if (!data.candidates.length) return null;
        const candidate = data.candidates[0];
        if (!candidate.id || !candidate.accesskey) throw new Error('酷狗歌词候选结构异常');
        const lyric = await get('https://lyrics.kugou.com/download', {
            ver: 1, client: 'pc', id: candidate.id, accesskey: candidate.accesskey, fmt: 'lrc', charset: 'utf8',
        }, headers);
        if (!lyric || lyric.status !== 200 || typeof lyric.content !== 'string' || (lyric.fmt && lyric.fmt !== 'lrc')) {
            throw new Error('酷狗 LRC 歌词响应异常');
        }
        return lyric.content ? { rawLrc: decodeBase64(lyric.content) } : null;
    },
    async importMusicItem(input) {
        let id = String(input || '').trim();
        if (!/^[a-f0-9]{32}$/i.test(id)) {
            const url = inputUrl(id, ['www.kugou.com', 'm.kugou.com', 'kugou.com']);
            id = url.searchParams.get('hash') || new URL('https://www.kugou.com/?' + url.hash.replace(/^#/, '')).searchParams.get('hash');
        }
        return getMusicInfo({ id: hashId(id) });
    },
};
