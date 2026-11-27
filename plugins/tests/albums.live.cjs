const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 只替换 HTTP 边界，执行最终插件产物；不代表宿主 Axios 或原生播放验收。
const axios = { get: async function (base, options) {
    const url = new URL(base);
    for (const [key, value] of Object.entries(options.params)) url.searchParams.set(key, String(value));
    const response = await fetch(url, { headers: options.headers, signal: AbortSignal.timeout(options.timeout) });
    assert.ok(response.ok, 'HTTP ' + response.status);
    return { data: await response.json() };
} };

async function main() {
    for (const name of ['netease', 'qq', 'kugou', 'bilibili']) {
        const module = { exports: {} };
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', name, 'dist/plugin.js'), 'utf8'), {
            module, URL, require: function (id) { assert.equal(id, 'axios'); return axios; },
        });
        const plugin = module.exports;
        const first = await plugin.search('林俊杰', 1, 'album');
        const second = await plugin.search('林俊杰', 2, 'album');
        assert.ok(first.data.length && second.data.length);
        assert.notEqual(first.data[0].id, second.data[0].id);
        let album;
        let detail;
        for (const item of first.data) {
            album = item;
            detail = await plugin.getAlbumInfo(item, 1);
            if (detail.musicList.length > 1) break;
        }
        assert.ok(detail.musicList.length > 1, '需验证多曲目或多 P 样本');
        assert.equal(detail.musicList.length, detail.albumItem.worksNum);
        assert.equal(new Set(detail.musicList.map(s => s.id)).size, detail.musicList.length);
        assert.equal(detail.isEnd, true);
        for (const song of detail.musicList) assert.ok(song.id && song.title && song.artwork && song.duration > 0);
        const last = detail.musicList[detail.musicList.length - 1];
        let lastTrackDetail = true;
        try {
            const info = await plugin.getMusicInfo({ id: last.id });
            assert.equal(info.id, last.id);
        } catch (error) {
            // 专辑收录完整与匿名歌曲可用性独立；酷狗受限曲目仍保留在列表。
            if (name !== 'kugou' || !/歌曲不存在、受限/.test(error.message)) throw error;
            lastTrackDetail = 'provider-unavailable';
        }
        assert.equal((await plugin.getAlbumInfo(album, 2)).musicList.length, 0);
        console.log(JSON.stringify({ source: name, search: first.data.length, page2: second.data.length,
            album: album.id, tracks: detail.musicList.length, lastTrackDetail }));
    }
}

main().catch(function (error) { console.error('Album verification failed: ' + error.message); process.exitCode = 1; });
