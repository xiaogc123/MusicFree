const { request, HEADERS } = require('./api');
const { PLATFORM, songId, toMusicItem, importedSongId } = require('./mapper');
const { importMusicSheet } = require('./playlist');

const PAGE_SIZE = 30;

async function getMusicInfo(musicItem) {
    const id = songId(musicItem.id);
    const data = await request('/api/v3/song/detail', { c: '[{"id":' + id + '}]' });
    if (!Array.isArray(data.songs)) throw new Error('网易云歌曲详情响应结构异常');
    const song = data.songs.find(function (item) { return String(item.id) === id; });
    if (!song) throw new Error('该歌曲不存在或暂不可用');
    return toMusicItem(song);
}

module.exports = {
    platform: PLATFORM,
    version: '0.2.1',
    srcUrl: 'https://raw.githubusercontent.com/xiaogc123/MusicFree/master/plugins/netease/dist/plugin.js',
    author: 'xiaogc',
    description: '匿名搜索、标准音质播放、原文与翻译歌词、单曲及公开歌单完整导入。歌曲可用性取决于网易云返回结果。',
    primaryKey: ['id'],
    supportedSearchType: ['music'],
    defaultSearchType: 'music',
    cacheControl: 'no-cache',
    hints: {
        importMusicItem: ['支持歌曲 ID、music.163.com/song?id=数字及官网 hash 歌曲链接。短链接需先在浏览器展开。'],
        importMusicSheet: [
            '支持公开歌单 ID、music.163.com/playlist?id=数字及官网 hash 歌单链接，短链接需先展开。',
            '大歌单分批获取，耗时较长；缺歌、请求失败或歌单变化时整次失败，不导入部分歌曲。',
        ],
    },

    importMusicSheet,
    getMusicInfo,

    async search(query, page, type) {
        query = String(query == null ? '' : query).trim();
        if (!query || (type && type !== 'music')) return { data: [], isEnd: true };
        if (!Number.isSafeInteger(page) || page < 1) throw new Error('搜索页码必须是从 1 开始的整数');
        const data = await request('/api/search/get/web', {
            s: query, type: 1, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
        });
        const result = data.result;
        if (!result || !Number.isSafeInteger(result.songCount) || result.songCount < 0 ||
            (result.songs !== undefined && !Array.isArray(result.songs)) ||
            (result.songs === undefined && result.songCount !== 0)) {
            throw new Error('网易云搜索响应结构异常');
        }
        const songs = result.songs || [];
        return {
            data: songs.map(toMusicItem),
            isEnd: songs.length < PAGE_SIZE || page * PAGE_SIZE >= result.songCount,
        };
    },

    async getMediaSource(musicItem, quality = 'standard') {
        if (quality !== 'standard') return null;
        const id = songId(musicItem.id);
        const data = await request('/api/song/enhance/player/url', {
            ids: '[' + id + ']', br: 128000,
        });
        if (!Array.isArray(data.data)) throw new Error('网易云音源响应结构异常');
        const source = data.data.find(function (item) { return String(item.id) === id; });
        if (!source || source.code !== 200 || !source.url || source.freeTrialInfo) {
            throw new Error('该歌曲没有匿名完整音源或仅提供试听');
        }
        if (typeof source.url !== 'string' || !/^https?:\/\//i.test(source.url)) {
            throw new Error('网易云音源地址无效');
        }
        return { url: source.url, headers: HEADERS, quality: 'standard' };
    },

    async getLyric(musicItem) {
        const data = await request('/api/song/lyric', {
            id: songId(musicItem.id), lv: -1, kv: -1, tv: -1,
        });
        for (const field of [data.lrc, data.tlyric]) {
            if (field != null && (typeof field !== 'object' || Array.isArray(field) ||
                (field.lyric != null && typeof field.lyric !== 'string'))) {
                throw new Error('网易云歌词响应结构异常');
            }
        }
        const rawLrc = data.lrc && data.lrc.lyric;
        const translation = data.tlyric && data.tlyric.lyric;
        if (!rawLrc && !translation) return null;
        return { rawLrc: rawLrc || '', translation: translation || '' };
    },

    async importMusicItem(input) {
        return getMusicInfo({ id: importedSongId(input) });
    },
};
