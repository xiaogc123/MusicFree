const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 仅用于 Node.js 联网验证。运行时由 MusicFree 提供真正的 Axios。
const axios = {
    get: async function (url, options) {
        const target = new URL(url);
        for (const [key, value] of Object.entries(options.params)) {
            target.searchParams.set(key, String(value));
        }
        const response = await fetch(target, {
            headers: options.headers,
            signal: AbortSignal.timeout(options.timeout),
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return { data: await response.json() };
    },
};

async function main() {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/plugin.js'), 'utf8'), {
        module, exports: module.exports, URL,
        require: function (name) { assert.equal(name, 'axios'); return axios; },
    });
    const plugin = module.exports;
    const result = await plugin.search('欢乐颂', 1, 'music');
    assert.ok(result.data.length > 0, '搜索应有歌曲');
    for (const item of result.data) {
        assert.equal(typeof item.id, 'string');
        assert.ok(item.title);
        assert.equal(item.platform, plugin.platform);
    }
    console.log(JSON.stringify({ check: 'search', count: result.data.length, isEnd: result.isEnd }));
    const secondPage = await plugin.search('欢乐颂', 2, 'music');
    assert.ok(secondPage.data.length > 0, '第二页应有歌曲');
    assert.notEqual(secondPage.data[0].id, result.data[0].id, '不同页应请求不同数据');
    console.log(JSON.stringify({ check: 'pagination', count: secondPage.data.length }));

    const id = '1901862214';
    for (const input of [id, 'https://music.163.com/song?id=' + id, 'https://music.163.com/#/song?id=' + id]) {
        const item = await plugin.importMusicItem(input);
        assert.equal(item.id, id);
        assert.ok(item.title);
    }
    console.log(JSON.stringify({ check: 'import', id, formats: 3 }));
    const lyric = await plugin.getLyric({ id: '347230' });
    assert.ok(lyric && lyric.rawLrc, '样本歌曲应返回歌词');
    console.log(JSON.stringify({ check: 'lyric', hasOriginal: !!lyric.rawLrc, hasTranslation: !!lyric.translation }));

    const source = await plugin.getMediaSource({ id }, 'standard');
    assert.equal(source.quality, 'standard');
    const response = await fetch(source.url, {
        headers: { ...source.headers, Range: 'bytes=0-1023' },
        signal: AbortSignal.timeout(15000),
    });
    try {
        assert.equal(response.status, 206, '音源应支持 Range 请求');
        assert.match(response.headers.get('content-type'), /audio\//);
        const reader = response.body.getReader();
        try {
            const chunk = await reader.read();
            assert.ok(chunk.value && chunk.value.byteLength > 0);
            console.log(JSON.stringify({ check: 'audio', id, status: response.status,
                contentType: response.headers.get('content-type'), bytes: chunk.value.byteLength }));
        } finally {
            await reader.cancel();
        }
    } catch (error) {
        if (!response.body.locked) await response.body.cancel();
        throw error;
    }
    assert.equal(await plugin.getMediaSource({ id }, 'high'), null);
    console.log('Live checks passed. Android playback and host Axios remain to be verified.');
}

main().catch(function (error) {
    console.error('Live check failed: ' + error.message);
    process.exitCode = 1;
});
