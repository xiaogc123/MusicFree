const { get, searchInput, clean, httpUrl } = require('../../shared/api');
const platform = '喜马拉雅（公开有声书）';
const headers = { Referer: 'https://www.ximalaya.com/' };
const size = 100;

function id(value) {
    const text = String(value || '');
    if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text))) throw new Error('喜马拉雅 ID 无效');
    return text;
}

function image(value) { return value ? httpUrl(String(value).replace(/^\/\//, 'https://')) : ''; }

function chapter(track) {
    const title = clean(track.title);
    const duration = Number(track.duration);
    if (!title || !Number.isFinite(duration) || duration <= 0) throw new Error('喜马拉雅章节信息异常');
    return { platform, id: id(track.trackId || track.id), title, duration,
        artist: clean(track.nickname), album: clean(track.albumTitle || track.album_title),
        albumId: id(track.albumId || track.album_id), artwork: image(track.coverMiddle || track.cover_url || track.coverLarge),
        isPaid: track.isPaid === true || track.is_paid === true, isSample: track.isSample === true };
}

async function pageOf(albumId, page) {
    const result = await get('https://mobile.ximalaya.com/mobile/v1/album/track/', {
        albumId, pageId: page, pageSize: size, isAsc: true,
    }, headers);
    const data = result && result.data;
    if (!result || result.ret !== 0 || !data || data.pageId !== page || data.pageSize !== size ||
        !Number.isSafeInteger(data.totalCount) || data.totalCount < 0 || !Array.isArray(data.list)) throw new Error('喜马拉雅目录接口异常');
    return data;
}

async function detail(item) {
    const target = id(item.id);
    const data = await get('https://m.ximalaya.com/tracks/' + target + '.json', {}, headers);
    if (!data || String(data.id) !== target || (data.ret != null && ![0, 200].includes(data.ret))) throw new Error('喜马拉雅章节详情异常');
    return data;
}

module.exports = {
    platform, version: '0.1.0', author: 'xiaogc', primaryKey: ['id'],
    srcUrl: 'https://raw.githubusercontent.com/xiaogc123/MusicFree/refs/heads/master/plugins/ximalaya/dist/plugin.js',
    description: '按专辑搜索书籍，完整读取章节目录，仅播放匿名公开完整章节；付费和试听明确失败。无原生歌词。',
    supportedSearchType: ['album'], defaultSearchType: 'album', cacheControl: 'no-cache',
    async search(query, page, type = 'album') {
        query = searchInput(query, page, type, ['album']);
        if (!query) return { data: [], isEnd: true };
        const result = await get('https://www.ximalaya.com/revision/search', {
            core: 'album', kw: query, page, rows: 20, spellchecker: 'true', condition: 'relation', device: 'web',
        }, headers);
        const data = result && result.data && result.data.result && result.data.result.response;
        if (!result || result.ret !== 200 || !data || !Array.isArray(data.docs) ||
            !Number.isSafeInteger(data.numFound) || data.numFound < 0) throw new Error('喜马拉雅书籍搜索异常');
        return { isEnd: page * 20 >= data.numFound || data.docs.length < 20,
            data: data.docs.map(function (book) {
                if (!clean(book.title) || !Number.isSafeInteger(book.tracks) || book.tracks < 0) throw new Error('喜马拉雅书籍字段异常');
                return { platform, id: id(book.id), title: clean(book.title), artist: clean(book.nickname),
                    artwork: image(book.cover_path), description: clean(book.intro), worksNum: book.tracks, isPaid: book.is_paid === true };
            }) };
    },
    async getAlbumInfo(item, page = 1) {
        const albumId = id(item.id);
        if (!Number.isSafeInteger(page) || page < 1) throw new Error('目录页码无效');
        if (page > 1) return { musicList: [], isEnd: true };
        const first = await pageOf(albumId, 1);
        const total = first.totalCount;
        if (item.worksNum != null && item.worksNum !== total) throw new Error('书籍章节数量变化，请重新搜索');
        const musicList = [];
        const seen = new Set();
        const pages = Math.max(1, Math.ceil(total / size));
        for (let current = 1; current <= pages; current++) {
            const data = current === 1 ? first : await pageOf(albumId, current);
            const expected = Math.min(size, total - (current - 1) * size);
            if (data.totalCount !== total || data.list.length !== expected) throw new Error('书籍目录缺章或数量变化，整次读取失败');
            for (const track of data.list) {
                const song = chapter(track);
                if (song.albumId !== albumId || seen.has(song.id) || track.orderNo !== musicList.length + 1) throw new Error('书籍章节归属、重复或顺序异常');
                seen.add(song.id);
                musicList.push(song);
            }
        }
        const final = await pageOf(albumId, 1);
        // 播放数等非目录字段可能变化，只核对身份和顺序。
        const snapshot = function (data) { return data.list.map(function (s) { return [s.trackId, s.orderNo, s.title]; }); };
        if (final.totalCount !== total || JSON.stringify(snapshot(final)) !== JSON.stringify(snapshot(first))) throw new Error('读取期间书籍目录变化，请重试');
        return { musicList, isEnd: true, albumItem: Object.assign({}, item, { platform, id: albumId, worksNum: total }) };
    },
    async getMusicInfo(item) { return chapter(await detail(item)); },
    async getMediaSource(item, quality = 'standard') {
        if (quality !== 'standard') return null;
        const data = await detail(item);
        if (data.is_paid !== false || data.isSample || data.is_sample || data.isVipFirst || item.isPaid || item.isSample) {
            throw new Error('喜马拉雅章节需要权限或仅提供试听');
        }
        const info = chapter(data);
        if (Number(item.duration) > 0 && Math.abs(info.duration - Number(item.duration)) > 1) throw new Error('章节时长变化，无法确认完整音频');
        return { url: httpUrl(data.play_path_64 || data.play_path_32 || data.play_path), headers, quality: 'standard' };
    },
    async getLyric(item) { id(item.id); return null; },
};
