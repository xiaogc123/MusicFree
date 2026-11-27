const { get, searchInput, clean, httpUrl, inputUrl, decodeBase64 } = require('../../shared/api');
const platform = '汽水音乐（匿名整曲）';
const api = 'https://api-vehicle.volcengine.com';
const headers = { Referer: 'https://music.douyin.com/' };
let searchSession = null;

function trackId(value) {
    // 汽水 ID 超出 JavaScript 安全整数范围，始终按字符串处理。
    if (typeof value !== 'string' || !/^[1-9]\d{0,19}$/.test(value)) throw new Error('汽水歌曲 ID 必须是十进制字符串');
    return value;
}

function dataList(response) {
    if (!response || response.errno !== 0 || !response.data || !Array.isArray(response.data.list)) {
        throw new Error('汽水接口失败或列表结构异常');
    }
    return response.data;
}

function mapSong(song) {
    const id = trackId(song.item_id);
    const title = clean(song.title);
    const duration = Number(song.duration);
    if (!title || !Number.isFinite(duration) || duration < 0) throw new Error('汽水歌曲详情结构异常');
    return { platform, id, title, duration, artist: clean(song.author_info && song.author_info.name),
        album: clean(song.collection_name), artwork: song.cover_url ? httpUrl(song.cover_url) : '' };
}

async function detail(item) {
    const id = trackId(item.id);
    const data = dataList(await get(api + '/v2/custom/contents', {
        sources: 'qishui', need_author: true, need_album: true, need_ugc: true, need_stat: true, item_ids: id,
    }, headers));
    const song = data.list.find(function (song) { return song.item_id === id; });
    if (!song) throw new Error('汽水歌曲不存在或详情身份不匹配');
    return song;
}

async function getMusicInfo(item) { return mapSong(await detail(item)); }

function encryptionFlag(value) {
    return value != null && value !== '' && value !== false && value !== 0 && value !== '0';
}

async function searchPage(query, page) {
    if (!searchSession || searchSession.query !== query || page === 1) {
        searchSession = { query, pages: new Map() };
    }
    const session = searchSession;
    let previous = null;
    for (let number = 1; number <= page; number++) {
        if (previous && previous.isEnd) return { data: [], isEnd: true };
        if (!session.pages.has(number)) {
            const cursor = previous && previous.cursor;
            const promise = (async function () {
                const params = { keyword: query, search_type: 'music', limit: 30, search_source: 'qishui' };
                if (cursor) params.search_params = cursor;
                const data = dataList(await get(api + '/v2/search/type', params, headers));
                if (![true, false, 0, 1].includes(data.has_more) || (!data.list.length && data.has_more) ||
                    (data.has_more && (typeof data.search_params !== 'string' || !data.search_params))) {
                    throw new Error('汽水搜索分页结构异常');
                }
                return { data: data.list.map(mapSong), isEnd: !data.has_more, cursor: data.search_params };
            })();
            session.pages.set(number, promise);
            promise.catch(function () { session.pages.delete(number); });
        }
        previous = await session.pages.get(number);
    }
    return { data: previous.data, isEnd: previous.isEnd };
}

module.exports = {
    platform, version: '0.1.0', author: 'xiaogc', primaryKey: ['id'],
    srcUrl: 'https://raw.githubusercontent.com/xiaogc123/MusicFree/refs/heads/master/plugins/qishui/dist/plugin.js',
    description: '匿名搜索、详情、原生歌词及单曲导入。仅播放接口提供的完整公开音源，拒绝试听和明确加密的流，不支持会员解锁。',
    supportedSearchType: ['music'], defaultSearchType: 'music', cacheControl: 'no-cache',
    hints: { importMusicItem: ['支持汽水歌曲数字 ID 或 music.douyin.com/qishui/song/数字 完整链接；短链接需先展开。'] },
    getMusicInfo,
    async search(query, page, type) {
        query = searchInput(query, page, type);
        if (!query) return { data: [], isEnd: true };
        return searchPage(query, page);
    },
    async getMediaSource(item, quality = 'standard') {
        if (quality !== 'standard') return null;
        const id = trackId(item.id);
        const data = await get('https://beta-luna.douyin.com/luna/h5/seo_track', {
            track_id: id, device_platform: 'web',
        }, headers);
        const track = data && data.seo_track && data.seo_track.track;
        if (!track || trackId(track.id) !== id) throw new Error('汽水音源歌曲身份不匹配');
        let model;
        try { model = JSON.parse(data.track_player.video_model); } catch (_) { throw new Error('汽水音源模型结构异常'); }
        const fullDuration = Number(track.duration) / 1000;
        const streamDuration = Number(model.video_duration);
        if (!Number.isFinite(fullDuration) || fullDuration <= 0 || !Number.isFinite(streamDuration) ||
            streamDuration <= 0 || Math.abs(fullDuration - streamDuration) > 1) {
            throw new Error('汽水仅提供试听或无法确认整曲时长，已拒绝播放');
        }
        if (model.status !== 10 || !Array.isArray(model.video_list) || !model.video_list.length) {
            throw new Error('汽水没有可用的完整音源');
        }
        if (encryptionFlag(model.spade_a) || encryptionFlag(model.encrypted) || encryptionFlag(model.encrypt)) {
            throw new Error('汽水音源需要解密，不支持匿名直接播放');
        }
        const streams = model.video_list.slice().sort(function (left, right) {
            return Number(left.video_meta && left.video_meta.bitrate) - Number(right.video_meta && right.video_meta.bitrate);
        });
        const stream = streams.find(function (stream) { return stream.video_meta && stream.video_meta.quality === 'medium'; }) || streams[0];
        const meta = stream.video_meta || {};
        if (encryptionFlag(stream.spade_a) || encryptionFlag(meta.encrypted) || encryptionFlag(meta.encrypt)) {
            throw new Error('汽水音频流带有加密标记');
        }
        // gear_des_key 也出现在已验证的明文 AAC 音轨中，不单独视为加密标记。
        const encoded = stream.main_url || stream.backup_url;
        if (typeof encoded !== 'string') throw new Error('汽水音源缺少 URL');
        return { url: httpUrl(/^https?:\/\//i.test(encoded) ? encoded : decodeBase64(encoded)), headers, quality: 'standard' };
    },
    async getLyric(item) {
        const song = await detail(item);
        if (song.lyric_info == null) return null;
        if (typeof song.lyric_info !== 'object' || Array.isArray(song.lyric_info) ||
            typeof song.lyric_info.lyric_text !== 'string') throw new Error('汽水歌词响应结构异常');
        return song.lyric_info.lyric_text ? { rawLrc: song.lyric_info.lyric_text } : null;
    },
    async importMusicItem(input) {
        let id = String(input || '').trim();
        if (!/^[1-9]\d{0,19}$/.test(id)) {
            const url = inputUrl(id, ['music.douyin.com']);
            const match = url.pathname.match(/^\/qishui\/song\/([1-9]\d{0,19})\/?$/);
            if (!match) throw new Error('请使用汽水歌曲完整链接');
            id = match[1];
        }
        return getMusicInfo({ id: trackId(id) });
    },
};
