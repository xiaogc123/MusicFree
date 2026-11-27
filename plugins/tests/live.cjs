const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const axios = { get: async function (base, options) {
    const url = new URL(base);
    for (const [key, value] of Object.entries(options.params)) url.searchParams.set(key, String(value));
    const response = await fetch(url, { headers: options.headers, signal: AbortSignal.timeout(options.timeout) });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const text = await response.text();
    try { return { data: JSON.parse(text) }; } catch (_) { return { data: text }; }
} };

function load(name) {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', name, 'dist/plugin.js'), 'utf8'), {
        module, URL, require: function (name) { assert.equal(name, 'axios'); return axios; },
    });
    return module.exports;
}

async function audioProbe(source) {
    const response = await fetch(source.url, { headers: { ...source.headers, Range: 'bytes=0-1023' },
        signal: AbortSignal.timeout(15000) });
    const reader = response.body.getReader();
    try {
        assert.ok(response.ok, '音频 URL 必须可读取');
        assert.match(response.headers.get('content-type'), /audio|octet-stream|mp4/i);
        const chunk = await reader.read();
        assert.ok(chunk.value && chunk.value.byteLength);
        return { status: response.status, type: response.headers.get('content-type'), bytes: chunk.value.byteLength };
    } finally { await reader.cancel(); }
}

async function qishuiAudioProbe(source, expectedDuration) {
    const response = await fetch(source.url, { headers: { ...source.headers, Range: 'bytes=0-65535' },
        signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 206);
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
        while (bytes < 65536) {
            const chunk = await reader.read();
            if (chunk.done) break;
            chunks.push(Buffer.from(chunk.value));
            bytes += chunk.value.byteLength;
        }
    } finally { await reader.cancel(); }
    const head = Buffer.concat(chunks).subarray(0, 65536);
    const moov = head.indexOf(Buffer.from('moov'));
    assert.ok(moov >= 4, 'M4A 必须有可读取的 moov');
    const size = head.readUInt32BE(moov - 4);
    assert.ok(moov - 4 + size <= head.length, '需读取完整 moov 后才能核对时长和加密标记');
    const metadata = head.subarray(moov - 4, moov - 4 + size);
    for (const marker of ['enca', 'senc', 'tenc']) assert.equal(metadata.indexOf(Buffer.from(marker)), -1, '不能将加密音轨标作明文');
    assert.ok(metadata.includes(Buffer.from('mp4a')), '应为普通 AAC 音轨');
    const mvhd = metadata.indexOf(Buffer.from('mvhd'));
    assert.ok(mvhd >= 4);
    const version = metadata[mvhd + 4];
    const scale = metadata.readUInt32BE(mvhd + (version === 1 ? 24 : 16));
    const ticks = version === 1 ? Number(metadata.readBigUInt64BE(mvhd + 28)) : metadata.readUInt32BE(mvhd + 20);
    const duration = ticks / scale;
    assert.ok(Number.isFinite(duration) && Math.abs(duration - expectedDuration) <= 1,
        '文件容器实际时长必须与歌曲完整时长一致');
    return { status: response.status, bytes: head.length, containerDuration: duration, encrypted: false };
}

async function main() {
    const results = [];
    for (const name of ['kugou', 'qq', 'bilibili']) {
        const plugin = load(name);
        const first = await plugin.search(name === 'bilibili' ? '贝多芬 欢乐颂 音乐' : '欢乐颂', 1, 'music');
        assert.ok(first.data.length > 0);
        const second = await plugin.search(name === 'bilibili' ? '贝多芬 欢乐颂 音乐' : '欢乐颂', 2, 'music');
        assert.ok(second.data.length > 0);
        assert.notEqual(first.data[0].id, second.data[0].id);
        const item = first.data[0];
        const imported = await plugin.importMusicItem(item.id);
        assert.equal(imported.id, item.id);
        const info = await plugin.getMusicInfo({ id: item.id });
        assert.equal(info.id, item.id);
        const lyric = await plugin.getLyric({ ...item, ...info });
        if (name !== 'bilibili') assert.ok(lyric && lyric.rawLrc, '音乐平台样本应有原文歌词');
        else assert.equal(lyric, null);
        const source = await plugin.getMediaSource(item, 'standard');
        const audio = await audioProbe(source);
        const result = { source: name, search: first.data.length, page2: second.data.length, id: item.id,
            imported: true, hasLyric: !!lyric, hasTranslation: !!(lyric && lyric.translation), audio };
        results.push(result);
        console.log(JSON.stringify(result));
    }
    const qishui = load('qishui');
    const first = await qishui.search('原创纯音乐', 1, 'music');
    const second = await qishui.search('原创纯音乐', 2, 'music');
    assert.ok(first.data.length && second.data.length);
    assert.notEqual(first.data[0].id, second.data[0].id);
    const id = '7543643914910517290';
    const imported = await qishui.importMusicItem('https://music.douyin.com/qishui/song/' + id);
    assert.equal(imported.id, id);
    const source = await qishui.getMediaSource({ id }, 'standard');
    const audio = await qishuiAudioProbe(source, imported.duration);
    const lyric = await qishui.getLyric({ id: '7501674235158431760' });
    assert.ok(lyric && lyric.rawLrc, '汽水有词样本应返回原生歌词');
    await assert.rejects(qishui.getMediaSource({ id: '7501674235158431760' }, 'standard'), /试听|整曲/);
    const qishuiResult = { source: 'qishui', search: first.data.length, page2: second.data.length,
        id, imported: true, lyricSampleHasText: true, trialRejected: true, audio };
    results.push(qishuiResult);
    console.log(JSON.stringify(qishuiResult));
    const destination = path.join(__dirname, '../../tmp/five-source-research');
    fs.mkdirSync(destination, { recursive: true });
    fs.writeFileSync(path.join(destination, 'live-summary.json'), JSON.stringify(results, null, 2));
    console.log('Live checks passed. Fetch adapter used; Android host and native playback remain unverified.');
}

main().catch(function (error) { console.error('Live verification failed: ' + error.message); process.exitCode = 1; });
