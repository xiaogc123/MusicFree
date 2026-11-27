const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const axios = { get: async function (base, options) {
    const url = new URL(base);
    for (const [key, value] of Object.entries(options.params)) url.searchParams.set(key, String(value));
    const response = await fetch(url, { headers: options.headers, signal: AbortSignal.timeout(options.timeout) });
    assert.ok(response.ok, 'HTTP ' + response.status);
    return { data: await response.json() };
} };

function load(name) {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', name, 'dist/plugin.js'), 'utf8'), {
        module, URL, require: function (name) { assert.equal(name, 'axios'); return axios; },
    });
    return module.exports;
}

async function probe(source, expected) {
    const response = await fetch(source.url, { headers: { ...source.headers, Range: 'bytes=0-65535' }, signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 206);
    const chunks = [Buffer.from(await response.arrayBuffer())];
    assert.ok(chunks[0].length);
    if (chunks[0].indexOf(Buffer.from('mvhd')) < 0) {
        const tail = await fetch(source.url, { headers: { ...source.headers, Range: 'bytes=-65536' }, signal: AbortSignal.timeout(15000) });
        assert.equal(tail.status, 206);
        chunks.push(Buffer.from(await tail.arrayBuffer()));
    }
    const metadata = chunks.find(c => c.indexOf(Buffer.from('mvhd')) >= 0);
    assert.ok(metadata, '需核对文件容器实际时长');
    const offset = metadata.indexOf(Buffer.from('mvhd'));
    const version = metadata[offset + 4];
    const scale = metadata.readUInt32BE(offset + (version === 1 ? 24 : 16));
    const ticks = version === 1 ? Number(metadata.readBigUInt64BE(offset + 28)) : metadata.readUInt32BE(offset + 20);
    const duration = ticks / scale;
    assert.ok(Math.abs(duration - expected) <= 2, '音频实际时长与完整章节一致');
    return { status: response.status, bytes: chunks.reduce((n, c) => n + c.length, 0), containerDuration: duration };
}

async function main() {
    const xm = load('ximalaya');
    for (const plugin of [xm, load('lrts')]) {
        try {
            const first = await plugin.search('西游记', 1, 'album');
            const second = await plugin.search('西游记', 2, 'album');
            assert.ok(first.data.length && second.data.length);
            assert.notEqual(first.data[0].id, second.data[0].id);
            console.log(JSON.stringify({ platform: plugin.platform, search: first.data.length, page2: second.data.length }));
        } catch (error) {
            if (plugin.platform !== '懒人听书（书籍）' || !/需要登录/.test(error.message)) throw error;
            console.log(JSON.stringify({ source: 'lrts', searchLoginRequired: true, subscribed: false }));
        }
    }
    const detail = await xm.getAlbumInfo({ id: '11008436', title: '西游记' }, 1);
    assert.equal(detail.musicList.length, detail.albumItem.worksNum);
    assert.ok(detail.musicList.length > 400);
    assert.equal(new Set(detail.musicList.map(s => s.id)).size, detail.musicList.length);
    const last = detail.musicList[detail.musicList.length - 1];
    assert.equal((await xm.getMusicInfo({ id: last.id })).id, last.id);
    const first = detail.musicList[0];
    const source = await xm.getMediaSource(first);
    const audio = await probe(source, first.duration);
    assert.equal(await xm.getLyric(first), null);
    console.log(JSON.stringify({ source: 'ximalaya', chapters: detail.musicList.length, lastId: last.id, audio }));
    const lr = load('lrts');
    try {
        const book = await lr.getAlbumInfo({ id: '91598933' }, 1);
        assert.equal(book.musicList.length, 42);
        assert.equal(book.musicList[41].id, '91598933:42');
        await assert.rejects(lr.getMediaSource(book.musicList[0]), /需要登录/);
        assert.equal(await lr.getLyric(book.musicList[0]), null);
        console.log(JSON.stringify({ source: 'lrts', chapters: book.musicList.length, loginRequired: true, subscribed: false }));
    } catch (error) {
        if (!/需要登录/.test(error.message)) throw error;
        console.log(JSON.stringify({ source: 'lrts', chapterLoginRequired: true, subscribed: false }));
    }
    console.log('Fetch adapter verified; native playback and host Axios remain unverified.');
}

main().catch(function (error) { console.error('Audiobook verification failed: ' + error.message); process.exitCode = 1; });
