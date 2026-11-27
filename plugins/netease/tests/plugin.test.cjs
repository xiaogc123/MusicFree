const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load(responses = []) {
    const calls = [];
    const module = { exports: {} };
    const axios = { get: async function (url, options) {
        calls.push({ url, ...options });
        const response = responses.shift();
        if (response instanceof Error) throw response;
        return { data: response };
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/plugin.js'), 'utf8'), {
        module, exports: module.exports,
        require: function (name) { assert.equal(name, 'axios'); return axios; },
        URL,
    });
    return { plugin: module.exports, calls };
}

const song = { id: 123, name: '歌曲', ar: [{ name: '歌手甲' }, { name: '歌手乙' }],
    al: { name: '专辑', picUrl: 'https://example.com/cover.jpg' }, dt: 123400 };

test('构建产物导出首版契约', function () {
    const { plugin } = load();
    assert.equal(plugin.platform, '网易云音乐（匿名版）');
    for (const method of ['search', 'getMediaSource', 'getLyric', 'importMusicItem']) {
        assert.equal(typeof plugin[method], 'function');
    }
    assert.deepEqual(Array.from(plugin.supportedSearchType), ['music']);
});

test('搜索映射歌曲信息并按总数结束第二页', async function () {
    const { plugin, calls } = load([{ code: 200, result: { songs: [song], songCount: 31 } }]);
    const result = await plugin.search(' 歌曲 ', 2, 'music');
    assert.equal(calls[0].params.offset, 30);
    assert.equal(calls[0].params.s, '歌曲');
    assert.equal(calls[0].timeout, 15000);
    assert.equal(result.isEnd, true);
    assert.equal(result.data[0].id, '123');
    assert.equal(result.data[0].artist, '歌手甲 / 歌手乙');
    assert.equal(result.data[0].duration, 123.4);
});

test('满页且有后续歌曲时继续分页', async function () {
    const { plugin } = load([{ code: 200, result: { songs: Array(30).fill(song), songCount: 60 } }]);
    assert.equal((await plugin.search('歌曲', 1, 'music')).isEnd, false);
});

test('空关键词和未支持类型不请求网络', async function () {
    const { plugin, calls } = load();
    assert.equal((await plugin.search(' ', 1, 'music')).data.length, 0);
    assert.equal((await plugin.search('歌曲', 1, 'album')).data.length, 0);
    assert.equal(calls.length, 0);
    await assert.rejects(plugin.search('歌曲', 0, 'music'), /页码/);
});

test('空搜索正常，响应结构异常和接口错误不伪装为空', async function () {
    const { plugin } = load([{ code: 200, result: { songCount: 0 } }, { code: 200 }, { code: 301 }]);
    assert.equal((await plugin.search('空', 1, 'music')).data.length, 0);
    await assert.rejects(plugin.search('异常', 1, 'music'), /结构/);
    await assert.rejects(plugin.search('失败', 1, 'music'), /301/);
});

test('播放按 ID 选择标准音源并保留必要请求头', async function () {
    const { plugin, calls } = load([{ code: 200, data: [
        { id: 999, code: 200, url: 'https://example.com/wrong.mp3' },
        { id: 123, code: 200, url: 'https://example.com/song.mp3', br: 128000, freeTrialInfo: null },
    ] }]);
    const result = await plugin.getMediaSource({ id: '123' }, 'standard');
    assert.equal(result.url, 'https://example.com/song.mp3');
    assert.equal(result.quality, 'standard');
    assert.equal(calls[0].params.br, 128000);
    assert.equal(result.headers.Referer, 'https://music.163.com/');
});

test('其他音质不可用且不发请求', async function () {
    const { plugin, calls } = load();
    for (const quality of ['low', 'high', 'super']) {
        assert.equal(await plugin.getMediaSource({ id: '123' }, quality), null);
    }
    assert.equal(calls.length, 0);
});

test('试听、无地址、错误歌曲、异常协议均不能返回音源', async function () {
    for (const source of [
        { id: 123, code: 200, url: 'https://example.com/trial.mp3', freeTrialInfo: { end: 30 } },
        { id: 123, code: -110, url: null },
        { id: 999, code: 200, url: 'https://example.com/wrong.mp3' },
        { id: 123, code: 200, url: 'file:///private.mp3' },
    ]) {
        const { plugin } = load([{ code: 200, data: [source] }]);
        await assert.rejects(plugin.getMediaSource({ id: '123' }, 'standard'));
    }
});

test('歌词映射原文翻译，无歌词返回 null', async function () {
    const { plugin } = load([{ code: 200, lrc: { lyric: '[00:01.00]歌曲' }, tlyric: { lyric: '翻译' } },
        { code: 200, nolyric: true }]);
    const lyric = await plugin.getLyric({ id: '123' });
    assert.equal(lyric.rawLrc, '[00:01.00]歌曲');
    assert.equal(lyric.translation, '翻译');
    assert.equal(await plugin.getLyric({ id: '123' }), null);
});

test('单曲 ID 和官方长链接均导入目标歌曲', async function () {
    for (const input of ['123', 'https://music.163.com/song?id=123',
        'https://music.163.com/#/song?id=123', 'https://music.163.com/m/song?id=123&userid=42']) {
        const { plugin, calls } = load([{ code: 200, songs: [song] }]);
        assert.equal((await plugin.importMusicItem(input)).id, '123');
        assert.equal(calls[0].params.c, '[{"id":123}]');
    }
});

test('拒绝非法 ID、非歌曲链接、伪装域名和短链接', async function () {
    const { plugin, calls } = load();
    for (const input of ['0', '-1', '1.5', '9007199254740993', '',
        'https://music.163.com/playlist?id=123', 'https://music.163.com.evil.test/song?id=123',
        'https://evil.test/?url=https://music.163.com/song?id=123', 'https://163cn.tv/abc']) {
        await assert.rejects(plugin.importMusicItem(input));
    }
    assert.equal(calls.length, 0);
});

test('单曲不存在或接口返回别的歌曲时明确失败', async function () {
    const { plugin } = load([{ code: 200, songs: [] }, { code: 200, songs: [{ ...song, id: 999 }] }]);
    await assert.rejects(plugin.importMusicItem('123'), /不存在|不可用/);
    await assert.rejects(plugin.importMusicItem('123'), /不存在|不可用/);
});

test('网络错误不泄露原始请求及敏感参数', async function () {
    const { plugin } = load([new Error('secret-cookie https://private.test')]);
    await assert.rejects(plugin.search('歌曲', 1, 'music'), function (error) {
        assert.match(error.message, /网络|超时/);
        assert.doesNotMatch(error.message, /secret-cookie|private/);
        return true;
    });
});

test('搜索计数缺失和零计数配错误列表不能导致错误分页', async function () {
    const { plugin } = load([
        { code: 200, result: { songs: Array(30).fill(song) } },
        { code: 200, result: { songs: 'invalid', songCount: 0 } },
    ]);
    await assert.rejects(plugin.search('歌曲', 1, 'music'), /结构/);
    await assert.rejects(plugin.search('歌曲', 1, 'music'), /结构/);
});

test('旧版搜索字段仍正确映射，空结果无后续页', async function () {
    const { plugin } = load([{ code: 200, result: { songs: [{ id: 456, name: '旧字段',
        artists: [{ name: '歌手' }], album: { name: '专辑' }, duration: 65000 }], songCount: 1 } }]);
    const result = await plugin.search('旧字段', 1, 'music');
    assert.equal(result.data[0].artist, '歌手');
    assert.equal(result.data[0].duration, 65);
    assert.equal(result.isEnd, true);
});

test('错误歌词字段不能被当作正常无歌词', async function () {
    const { plugin } = load([{ code: 200, lrc: { lyric: 0 } }, { code: 200, lrc: 'invalid' }]);
    await assert.rejects(plugin.getLyric({ id: '123' }), /结构/);
    await assert.rejects(plugin.getLyric({ id: '123' }), /结构/);
});
