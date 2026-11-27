const { request } = require('./api');
const { songId, toMusicItem, importedSheetId } = require('./mapper');

// GET 请求分成小批，避免长 ID 列表超过 URL 长度限制；总曲目数不设上限。
const DETAIL_BATCH_SIZE = 50;

async function getTrackIds(id) {
    const data = await request('/api/v6/playlist/detail', { id, n: 100000, s: 0 });
    const playlist = data.playlist;
    if (!playlist || songId(playlist.id) !== id || playlist.privacy !== 0 ||
        !Number.isSafeInteger(playlist.trackCount) || playlist.trackCount < 0 ||
        !Array.isArray(playlist.trackIds)) {
        throw new Error('歌单不存在、非公开或响应结构异常');
    }
    const ids = playlist.trackIds.map(function (track) { return songId(track.id); });
    if (ids.length !== playlist.trackCount || new Set(ids).size !== ids.length) {
        throw new Error('歌单 ID 列表不完整或存在重复，已停止导入（取得 ' +
            ids.length + '/' + playlist.trackCount + ' 首）');
    }
    return ids;
}

async function importMusicSheet(input) {
    const id = importedSheetId(input);
    try {
        const ids = await getTrackIds(id);
        const result = [];
        for (let offset = 0; offset < ids.length; offset += DETAIL_BATCH_SIZE) {
            const batch = ids.slice(offset, offset + DETAIL_BATCH_SIZE);
            const data = await request('/api/v3/song/detail', {
                c: JSON.stringify(batch.map(function (id) { return { id: Number(id) }; })),
            });
            if (!Array.isArray(data.songs)) throw new Error('歌单歌曲详情响应结构异常');
            const songs = new Map();
            const expectedIds = new Set(batch);
            for (const song of data.songs) {
                const item = toMusicItem(song);
                if (!expectedIds.has(item.id) || songs.has(item.id)) {
                    throw new Error('歌单歌曲详情返回了非请求歌曲或重复歌曲');
                }
                songs.set(item.id, item);
            }
            const missing = batch.filter(function (id) { return !songs.has(id); });
            if (missing.length) {
                throw new Error('歌单歌曲详情缺失 ' + missing.length + ' 首，首个缺失 ID：' + missing[0]);
            }
            for (const id of batch) result.push(songs.get(id));
        }
        // 分批期间歌单可能被编辑，最终重新核对完整 ID 序列，防止混合不同版本。
        const latestIds = await getTrackIds(id);
        if (latestIds.length !== ids.length || latestIds.some(function (id, index) { return id !== ids[index]; })) {
            throw new Error('歌单在导入期间发生变化，请稍后重新导入');
        }
        return result;
    } catch (error) {
        throw new Error('歌单导入失败，未返回部分歌曲：' + error.message);
    }
}

module.exports = { importMusicSheet };
