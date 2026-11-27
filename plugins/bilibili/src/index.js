const { get, zero, searchInput, clean, httpUrl, inputUrl } = require('../../shared/api');
const platform = 'bilibili（视频音频）';
const base = 'https://api.bilibili.com';
const headers = { Referer: 'https://www.bilibili.com/' };
let deviceCookie = '';

function identity(value) {
    const match = String(value || '').match(/^(BV[a-zA-Z0-9]{10})(?::([1-9]\d*))?$/);
    if (!match || !Number.isSafeInteger(Number(match[2] || 1))) throw new Error('bilibili BV 号或分 P 无效');
    return { bvid: match[1], page: Number(match[2] || 1) };
}

function duration(value) {
    if (typeof value === 'number') return value;
    const parts = String(value || '0').split(':');
    if (parts.some(function (part) { return !/^\d+$/.test(part); })) throw new Error('视频时长格式异常');
    return parts.reduce(function (total, part) { return total * 60 + Number(part); }, 0);
}

async function getMusicInfo(item) {
    const target = identity(item.id);
    const result = zero(await get(base + '/x/web-interface/view', { bvid: target.bvid }, headers));
    const data = result.data;
    if (!data || data.bvid !== target.bvid || !Array.isArray(data.pages)) throw new Error('bilibili 视频详情异常');
    const page = data.pages.find(function (page) { return page.page === target.page; });
    if (!page || !Number.isSafeInteger(page.cid) || page.cid < 1) throw new Error('请求的视频分 P 不存在');
    if (!clean(data.title)) throw new Error('bilibili 视频详情缺少标题');
    return { platform, id: target.bvid + ':' + target.page, bvid: target.bvid, page: target.page, cid: page.cid,
        title: clean(data.title) + (data.pages.length > 1 ? ' - ' + clean(page.part) : ''),
        artist: clean(data.owner && data.owner.name), album: target.bvid,
        artwork: data.pic ? httpUrl(data.pic.startsWith('//') ? 'https:' + data.pic : data.pic) : '',
        duration: duration(page.duration) };
}

module.exports = {
    platform, version: '0.2.0', author: 'xiaogc', primaryKey: ['id'],
    srcUrl: 'https://raw.githubusercontent.com/xiaogc123/MusicFree/refs/heads/master/plugins/bilibili/dist/plugin.js',
    description: '视频及视频专辑搜索、全部分 P 展开、独立音频流、分 P 导入和详情。视频无原生歌曲歌词，getLyric 返回无歌词，不以字幕替代。',
    supportedSearchType: ['music', 'album'], defaultSearchType: 'music', cacheControl: 'no-cache',
    hints: { importMusicItem: ['支持 BV 号或 www.bilibili.com/video/BV... 完整链接，保留 ?p= 分 P；b23.tv 短链接需先展开。'] },
    getMusicInfo,
    async getAlbumInfo(item, page = 1) {
        const target = identity(item.id);
        if (!Number.isSafeInteger(page) || page < 1) throw new Error('专辑页码必须是从 1 开始的整数');
        if (page > 1) return { musicList: [], isEnd: true };
        const data = zero(await get(base + '/x/web-interface/view', { bvid: target.bvid }, headers)).data;
        if (!data || data.bvid !== target.bvid || !clean(data.title) || !Array.isArray(data.pages) || !data.pages.length ||
            (data.videos != null && data.videos !== data.pages.length)) throw new Error('bilibili 专辑分 P 缺失或详情异常');
        const artwork = data.pic ? httpUrl(data.pic.startsWith('//') ? 'https:' + data.pic : data.pic) : '';
        const artist = clean(data.owner && data.owner.name);
        const cids = new Set();
        const musicList = data.pages.map(function (part, index) {
            if (part.page !== index + 1 || !Number.isSafeInteger(part.cid) || part.cid < 1 || cids.has(part.cid)) {
                throw new Error('bilibili 专辑分 P 缺失、重复或顺序异常');
            }
            cids.add(part.cid);
            return { platform, id: target.bvid + ':' + part.page, bvid: target.bvid, page: part.page, cid: part.cid,
                title: clean(data.title) + (data.pages.length > 1 ? ' - ' + clean(part.part) : ''),
                artist, album: clean(data.title), artwork, duration: duration(part.duration) };
        });
        return { musicList, isEnd: true, albumItem: { platform, id: target.bvid, title: clean(data.title),
            artist, artwork, description: clean(data.desc), worksNum: musicList.length } };
    },
    async search(query, page, type) {
        query = searchInput(query, page, type, ['music', 'album']);
        if (!query) return { data: [], isEnd: true };
        if (!deviceCookie) {
            const fingerprint = zero(await get(base + '/x/frontend/finger/spi', {}, headers)).data;
            if (!fingerprint || !fingerprint.b_3 || !fingerprint.b_4) throw new Error('bilibili 匿名设备信息异常');
            deviceCookie = 'buvid3=' + fingerprint.b_3 + ';buvid4=' + fingerprint.b_4;
        }
        const result = zero(await get(base + '/x/web-interface/search/type', {
            search_type: 'video', keyword: query, page, page_size: 20,
        }, Object.assign({}, headers, { Cookie: deviceCookie })));
        const data = result.data;
        if (!data || !Array.isArray(data.result) || !Number.isFinite(Number(data.numResults))) throw new Error('bilibili 搜索响应异常');
        return { isEnd: data.result.length < 20 || page * 20 >= Number(data.numResults),
            data: data.result.filter(function (video) { return !video.type || video.type === 'video'; }).map(function (video) {
                const target = identity(video.bvid);
                if (type === 'album') return { platform, id: target.bvid, bvid: target.bvid,
                    title: clean(video.title), artist: clean(video.author), description: clean(video.description),
                    artwork: video.pic ? httpUrl(video.pic.startsWith('//') ? 'https:' + video.pic : video.pic) : '' };
                return { platform, id: target.bvid + ':1', bvid: target.bvid, page: 1,
                    title: clean(video.title), artist: clean(video.author), album: target.bvid,
                    artwork: video.pic ? httpUrl(video.pic.startsWith('//') ? 'https:' + video.pic : video.pic) : '',
                    duration: duration(video.duration) };
            }) };
    },
    async getMediaSource(item, quality = 'standard') {
        if (quality !== 'standard') return null;
        const info = await getMusicInfo(item);
        const data = zero(await get(base + '/x/player/playurl', { bvid: info.bvid, cid: info.cid, fnval: 16 }, headers)).data;
        if (!data || data.is_preview || !data.dash || !Array.isArray(data.dash.audio) || !data.dash.audio.length) {
            throw new Error('视频没有可用的完整独立音频流或仅提供预览');
        }
        const audios = data.dash.audio.slice().sort(function (left, right) { return left.bandwidth - right.bandwidth; });
        const audio = audios[Math.min(1, audios.length - 1)];
        return { url: httpUrl(audio.baseUrl || audio.base_url), quality: 'standard',
            headers: { Referer: 'https://www.bilibili.com/video/' + info.bvid } };
    },
    async getLyric(item) {
        identity(item.id);
        return null;
    },
    async importMusicItem(input) {
        let id = String(input || '').trim();
        if (!/^BV[a-zA-Z0-9]{10}(?::[1-9]\d*)?$/.test(id)) {
            const url = inputUrl(id, ['www.bilibili.com', 'm.bilibili.com', 'bilibili.com']);
            const match = url.pathname.match(/^\/video\/(BV[a-zA-Z0-9]{10})\/?$/);
            if (!match) throw new Error('请使用 bilibili BV 视频链接');
            id = match[1] + ':' + (url.searchParams.get('p') || '1');
        }
        const target = identity(id);
        return getMusicInfo({ id: target.bvid + ':' + target.page });
    },
};
