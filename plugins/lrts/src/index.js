const { get, searchInput, clean, httpUrl } = require('../../shared/api');
const platform = '懒人听书（书籍）';
const headers = { Referer: 'https://m.lrts.me/' };
const base = 'https://m.lrts.me/ajax/';

function numberId(value) {
    const text = String(value || '');
    if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text))) throw new Error('懒人听书书籍或章节序号无效');
    return text;
}

function identity(value) {
    const parts = String(value || '').split(':');
    if (parts.length !== 2) throw new Error('章节身份必须包含书籍和章节序号');
    return { bookId: numberId(parts[0]), section: Number(numberId(parts[1])) };
}

async function request(method, params) {
    const data = await get(base + method, params, headers);
    if (data && [481, 482, 485, 10003].includes(Number(data.status))) throw new Error('懒人听书需要登录，当前匿名插件不可播放');
    if (!data || data.apiStatus !== 0 || (data.status != null && data.status !== 0)) throw new Error('懒人听书接口失败');
    return data;
}

function bookItem(book) {
    if (!clean(book.name) || !Number.isSafeInteger(book.sections) || book.sections < 0) throw new Error('懒人听书书籍字段异常');
    return { platform, id: numberId(book.id || book.baseEntityId), title: clean(book.name), artist: clean(book.announcer || book.author),
        description: clean(book.desc), artwork: book.cover ? httpUrl(book.cover) : '', worksNum: book.sections };
}

async function bookInfo(bookId) {
    const data = await request('getBookInfo', { id: bookId });
    if (String(data.baseEntityId) !== bookId) throw new Error('懒人听书书籍身份异常');
    return bookItem(data);
}

async function menu(bookId, page) {
    const data = await request('getBookMenu', { bookId, pageNum: page, pageSize: 50, sortType: 0 });
    if (String(data.bookId) !== bookId || !Array.isArray(data.list) || !Number.isSafeInteger(data.sections) || data.sections < 0) throw new Error('懒人听书目录结构异常');
    return data;
}

function chapter(raw, book) {
    const section = Number(numberId(raw.section));
    // 接口数字 id 实测已损失精度；使用字符串 sectionId 请求播放，主键由书籍和序号组成。
    if (typeof raw.sectionId !== 'string' || !/^[1-9]\d*$/.test(raw.sectionId) || !clean(raw.name) ||
        !Number.isFinite(Number(raw.length)) || Number(raw.length) <= 0) throw new Error('懒人听书章节字段异常');
    return { platform, id: book.id + ':' + section, bookId: book.id, section, resourceId: raw.sectionId,
        trackId: raw.tmeId || '', title: clean(raw.name), duration: Number(raw.length), artist: book.artist, album: book.title,
        artwork: book.artwork, restricted: Number(raw.payType) !== 0 || Number(raw.feeType) !== 0 || Number(raw.listenPrice) !== 0 || Number(raw.cantListen) !== 0 };
}

async function detail(item) {
    const target = identity(item.id);
    const book = await bookInfo(target.bookId);
    const data = await menu(target.bookId, Math.floor((target.section - 1) / 50) + 1);
    const raw = data.list.find(function (s) { return s.section === target.section; });
    if (!raw) throw new Error('懒人听书章节不存在');
    return chapter(raw, book);
}

module.exports = {
    platform, version: '0.1.0', author: 'xiaogc', primaryKey: ['id'],
    srcUrl: 'https://raw.githubusercontent.com/xiaogc123/MusicFree/refs/heads/master/plugins/lrts/dist/plugin.js',
    description: '书籍搜索和完整目录。官网当前播放需要登录，匿名播放尚未验收，不列入可用订阅。',
    supportedSearchType: ['album'], defaultSearchType: 'album', cacheControl: 'no-cache',
    async search(query, page, type = 'album') {
        query = searchInput(query, page, type, ['album']);
        if (!query) return { data: [], isEnd: true };
        const data = await request('searchBook', { keyWord: query, pageNum: page, pageSize: 20 });
        if (!Array.isArray(data.list) || ![0, 1].includes(data.hasNext) || !Number.isSafeInteger(data.count) || data.count < 0) throw new Error('懒人听书搜索结构异常');
        return { data: data.list.map(bookItem), isEnd: data.hasNext === 0 };
    },
    async getAlbumInfo(item, page = 1) {
        const bookId = numberId(item.id);
        if (!Number.isSafeInteger(page) || page < 1) throw new Error('目录页码无效');
        if (page > 1) return { musicList: [], isEnd: true };
        const book = await bookInfo(bookId);
        if (item.worksNum != null && item.worksNum !== book.worksNum) throw new Error('书籍章节数量变化，请重新搜索');
        const musicList = [];
        const seen = new Set();
        let first;
        for (let current = 1; current <= Math.max(1, Math.ceil(book.worksNum / 50)); current++) {
            const data = await menu(bookId, current);
            if (!first) first = data;
            if (data.sections !== book.worksNum || data.list.length !== Math.min(50, book.worksNum - musicList.length)) throw new Error('懒人听书目录缺章或数量变化');
            for (const raw of data.list) {
                const song = chapter(raw, book);
                if (song.section !== musicList.length + 1 || seen.has(song.resourceId)) throw new Error('懒人听书章节重复或顺序异常');
                seen.add(song.resourceId);
                musicList.push(song);
            }
        }
        const final = await menu(bookId, 1);
        const snapshot = function (data) { return data.list.map(function (s) { return [s.sectionId, s.section, s.name]; }); };
        if (final.sections !== book.worksNum || JSON.stringify(snapshot(first)) !== JSON.stringify(snapshot(final))) throw new Error('读取期间书籍目录变化，请重试');
        return { albumItem: book, musicList, isEnd: true };
    },
    getMusicInfo: detail,
    async getMediaSource(item, quality = 'standard') {
        if (quality !== 'standard') return null;
        const info = await detail(item);
        if (info.restricted) throw new Error('懒人听书章节需要权限或仅提供试听');
        const data = await request('getListenPath', { entityId: info.bookId, entityType: 1, resId: info.resourceId,
            section: info.section, opType: 0, quality: 1, trackId: info.trackId });
        const source = data.data || data;
        if (source.isTrial || source.isFreePart || !Number.isFinite(Number(source.duration)) ||
            Math.abs(Number(source.duration) - info.duration) > 1) throw new Error('无法确认懒人听书完整章节，拒绝试听');
        return { url: httpUrl(source.path || source.listenPath), headers, quality: 'standard' };
    },
    async getLyric(item) { identity(item.id); return null; },
};
