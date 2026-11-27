const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(name, replies = []) {
    const calls = [];
    const module = { exports: {} };
    const axios = { get: async function (url, options) {
        calls.push({ url, ...options });
        const reply = replies.shift();
        if (reply instanceof Error) throw reply;
        return { data: reply };
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', name, 'dist/plugin.js'), 'utf8'), {
        module, URL, require: function (name) { assert.equal(name, 'axios'); return axios; },
    });
    return { plugin: module.exports, calls };
}

const hash = '90a7ad0f993f07648560f81b162d144f';
const mid = '001MtBrU1i96vL';
const kgSong = { FileHash: hash.toUpperCase(), SongName: '<em>歌曲</em>', SingerName: '歌手',
    AlbumName: '专辑', Duration: 57, Image: 'https://img.test/{size}.jpg' };
const kgInfo = { status: 1, errcode: 0, hash: hash.toUpperCase(), songName: '歌曲',
    author_name: '歌手', timeLength: 57, pay_type: 0, url: 'https://audio.test/song.mp3' };
const qqSong = { songmid: mid, songname: '歌曲', singer: [{ name: '歌手' }],
    albummid: 'album1', albumname: '专辑', interval: 110, media_mid: 'media1', preview: { tryend: 0 } };
const qqInfo = { mid, title: '歌曲', singer: [{ name: '歌手' }], album: { mid: 'album1', name: '专辑' },
    interval: 110, file: { media_mid: 'media1', try_end: 0 }, pay: { pay_play: 0 } };
const bv = 'BV1xx411c7mD';
const biliInfo = { bvid: bv, title: '视频', pic: '//img.test/cover.jpg', owner: { name: 'UP主' },
    pages: [{ cid: 101, page: 1, part: '上集', duration: 100 }, { cid: 102, page: 2, part: '下集', duration: 200 }] };

test('bilibili 专辑搜索使用视频，详情展开全部分 P 并保留独立身份', async function () {
    const { plugin, calls } = load('bilibili', [{ code: 0, data: { b_3: 'a', b_4: 'b' } },
        { code: 0, data: { numResults: 1, result: [{ bvid: bv, title: '合集', author: 'UP', duration: '5:00' }] } },
        { code: 0, data: biliInfo }]);
    const album = (await plugin.search('林俊杰', 1, 'album')).data[0];
    assert.equal(album.id, bv);
    const result = await plugin.getAlbumInfo(album, 1);
    assert.deepEqual(Array.from(result.musicList, s => s.id), [bv + ':1', bv + ':2']);
    assert.equal(result.musicList[1].cid, 102);
    assert.equal(result.musicList[1].duration, 200);
    assert.equal(result.albumItem.worksNum, 2);
    assert.equal(result.isEnd, true);
    assert.equal((await plugin.getAlbumInfo(album, 2)).musicList.length, 0);
    assert.equal(calls.length, 3);
});

test('bilibili 专辑缺失、重复或不连续分 P 时失败', async function () {
    for (const pages of [[], [biliInfo.pages[1]], [biliInfo.pages[0], biliInfo.pages[0]],
        [biliInfo.pages[0], { ...biliInfo.pages[1], cid: 101 }]]) {
        const { plugin } = load('bilibili', [{ code: 0, data: { ...biliInfo, pages } }]);
        await assert.rejects(plugin.getAlbumInfo({ id: bv }, 1));
    }
});

test('bilibili 搜索排除课堂推广，按原始页长判断分页，异常视频仍失败', async function () {
    for (const type of ['music', 'album']) {
        const replies = [{ code: 0, data: { b_3: 'a', b_4: 'b' } }, { code: 0, data: { numResults: 100,
            result: [{ type: 'ketang', bvid: '' }, ...Array(19).fill({ type: 'video', bvid: bv, title: '视频' })] } }];
        const { plugin } = load('bilibili', replies);
        const result = await plugin.search('林俊杰', 1, type);
        assert.equal(result.data.length, 19);
        assert.equal(result.isEnd, false);
        const broken = load('bilibili', [{ code: 0, data: { b_3: 'a', b_4: 'b' } },
            { code: 0, data: { numResults: 1, result: [{ type: 'video', bvid: '' }] } }]);
        await assert.rejects(broken.plugin.search('林俊杰', 1, type), /BV/);
    }
});

test('QQ 专辑搜索与详情按实际返回数量续页，不静默截断', async function () {
    const album = { albumMID: mid, albumName: '专辑', singerName: '歌手', song_count: 2 };
    const response = list => ({ code: 0, albumSonglist: { code: 0, data: { albumMid: mid, totalNum: 2,
        songList: list.map(songInfo => ({ songInfo: { ...songInfo, album: { mid, name: '专辑' } } })) } } });
    const { plugin, calls } = load('qq', [{ code: 0, data: { album: { totalnum: 1, list: [album] } } },
        response([qqInfo]), response([{ ...qqInfo, mid: '002H8Ik90qPYDP' }])]);
    const item = (await plugin.search('林俊杰', 1, 'album')).data[0];
    assert.equal(calls[0].params.t, 8);
    const result = await plugin.getAlbumInfo(item, 1);
    assert.equal(result.musicList.length, 2);
    assert.equal(JSON.parse(calls[2].params.data).albumSonglist.param.begin, 1);
    assert.equal(result.isEnd, true);
});

test('QQ 专辑缺歌、重复、总数变化或身份不符时失败', async function () {
    for (const data of [{ albumMid: mid, totalNum: 1, songList: [] },
        { albumMid: 'wrong', totalNum: 1, songList: [{ songInfo: qqInfo }] },
        { albumMid: mid, totalNum: 2, songList: [{ songInfo: qqInfo }, { songInfo: qqInfo }] }]) {
        const { plugin } = load('qq', [{ code: 0, albumSonglist: { code: 0, data } }]);
        await assert.rejects(plugin.getAlbumInfo({ id: mid }, 1));
    }
});

test('酷狗专辑搜索和分批详情保留顺序、封面与秒制时长', async function () {
    const album = { albumid: 123, albumname: '专辑', singername: '歌手', songcount: 2, imgurl: 'https://img.test/{size}.jpg' };
    const song = { hash, filename: '歌手 - 歌曲', duration: 57, album_id: '123' };
    const { plugin, calls } = load('kugou', [{ status: 1, errcode: 0, data: { total: 1, info: [album] } },
        { status: 1, errcode: 0, data: album },
        { status: 1, errcode: 0, data: { total: 2, info: [song] } },
        { status: 1, errcode: 0, data: { total: 2, info: [{ ...song, hash: 'a'.repeat(32) }] } }]);
    const item = (await plugin.search('林俊杰', 1, 'album')).data[0];
    const result = await plugin.getAlbumInfo(item, 1);
    assert.equal(result.musicList.length, 2);
    assert.equal(result.musicList[0].title, '歌曲');
    assert.equal(result.musicList[0].duration, 57);
    assert.equal(result.musicList[0].artwork, 'https://img.test/240.jpg');
    assert.equal(calls[3].params.page, 2);
});

test('酷狗专辑总数与搜索不符、缺歌或重复时失败', async function () {
    for (const info of [[], [{ hash, filename: '歌曲' }, { hash, filename: '歌曲' }]]) {
        const { plugin } = load('kugou', [{ status: 1, errcode: 0, data: { albumid: 123, albumname: '专辑' } },
            { status: 1, errcode: 0, data: { total: 2, info } }]);
        await assert.rejects(plugin.getAlbumInfo({ id: '123', worksNum: 2 }, 1));
    }
});

test('QQ 与酷狗超过单批容量的专辑完整返回 205 首，后续页不重复请求', async function () {
    for (const name of ['qq', 'kugou']) {
        const songs = Array.from({ length: 205 }, function (_, i) {
            return name === 'qq' ? { ...qqInfo, mid: String(i + 1).padStart(14, '0'), album: { mid, name: '专辑' } } :
                { hash: (i + 1).toString(16).padStart(32, '0'), filename: '歌曲' + i, duration: 60, album_id: '123' };
        });
        const replies = name === 'kugou' ? [{ status: 1, errcode: 0, data: { albumid: 123, albumname: '专辑', songcount: 0 } }] : [];
        for (let i = 0; i < songs.length; i += 100) {
            replies.push(name === 'qq' ? { code: 0, albumSonglist: { code: 0, data: { albumMid: mid, totalNum: 205,
                songList: songs.slice(i, i + 100).map(songInfo => ({ songInfo })) } } } :
                { status: 1, errcode: 0, data: { total: 205, info: songs.slice(i, i + 100) } });
        }
        const { plugin, calls } = load(name, replies);
        const item = { id: name === 'qq' ? mid : '123', worksNum: 205 };
        const result = await plugin.getAlbumInfo(item, 1);
        assert.equal(result.musicList.length, 205);
        assert.equal(result.musicList[204].id, name === 'qq' ? songs[204].mid : songs[204].hash);
        const count = calls.length;
        assert.equal((await plugin.getAlbumInfo(item, 2)).musicList.length, 0);
        assert.equal(calls.length, count);
    }
});

test('QQ 与酷狗后续批次总数变化或请求失败不能返回部分专辑', async function () {
    for (const name of ['qq', 'kugou']) {
        for (const failed of [false, true]) {
            const replies = name === 'qq' ? [{ code: 0, albumSonglist: { code: 0, data: { albumMid: mid, totalNum: 2,
                songList: [{ songInfo: { ...qqInfo, album: { mid, name: '专辑' } } }] } } }] :
                [{ status: 1, errcode: 0, data: { albumid: 123, albumname: '专辑' } },
                    { status: 1, errcode: 0, data: { total: 2, info: [{ hash, filename: '歌曲' }] } }];
            replies.push(failed ? new Error('offline') : name === 'qq' ?
                { code: 0, albumSonglist: { code: 0, data: { albumMid: mid, totalNum: 3, songList: [] } } } :
                { status: 1, errcode: 0, data: { total: 3, info: [] } });
            const { plugin } = load(name, replies);
            await assert.rejects(plugin.getAlbumInfo({ id: name === 'qq' ? mid : '123' }, 1), /数量变化|请求失败/);
        }
    }
});

for (const source of ['kugou', 'qq', 'bilibili', 'qishui']) {
    test(source + ' 单文件导出契约，空搜索不请求网络', async function () {
        const { plugin, calls } = load(source);
        for (const method of ['search', 'getMusicInfo', 'getMediaSource', 'getLyric', 'importMusicItem']) {
            assert.equal(typeof plugin[method], 'function');
        }
        assert.deepEqual(Array.from(plugin.supportedSearchType), source === 'qishui' ? ['music'] : ['music', 'album']);
        assert.equal((await plugin.search(' ', 1, 'music')).data.length, 0);
        assert.equal((await plugin.search('歌曲', 1, 'artist')).data.length, 0);
        assert.equal(await plugin.getMediaSource({ id: 'invalid' }, 'high'), null);
        assert.equal(calls.length, 0);
    });
    test(source + ' 非法页码和外部链接不发请求', async function () {
        const { plugin, calls } = load(source);
        await assert.rejects(plugin.search('歌曲', 0, 'music'), /页码/);
        await assert.rejects(plugin.importMusicItem('https://evil.test/song?id=123'));
        assert.equal(calls.length, 0);
    });
    test(source + ' 网络失败不能伪装成空搜索或泄露请求信息', async function () {
        const { plugin } = load(source, [new Error('secret-cookie private-url')]);
        await assert.rejects(plugin.search('歌曲', 1, 'music'), function (error) {
            assert.doesNotMatch(error.message, /secret-cookie|private-url/);
            return true;
        });
    });
}

test('酷狗搜索分页、哈希、标题、封面和秒制时长', async function () {
    const { plugin, calls } = load('kugou', [{ status: 1, data: { lists: [kgSong], total: 31 } }]);
    const result = await plugin.search('歌曲', 2, 'music');
    assert.equal(calls[0].params.page, 2);
    assert.equal(result.data[0].id, hash);
    assert.equal(result.data[0].title, '歌曲');
    assert.equal(result.data[0].duration, 57);
    assert.equal(result.data[0].artwork, 'https://img.test/240.jpg');
    assert.equal(result.isEnd, true);
});
test('酷狗详情导入和标准播放按 hash 校验', async function () {
    const { plugin } = load('kugou', [kgInfo, kgInfo]);
    assert.equal((await plugin.importMusicItem('https://www.kugou.com/song/#hash=' + hash)).id, hash);
    assert.equal((await plugin.getMediaSource({ id: hash }, 'standard')).url, kgInfo.url);
});
test('酷狗错误身份、付费或试听不返回完整音源', async function () {
    for (const info of [{ ...kgInfo, hash: 'a'.repeat(32) }, { ...kgInfo, pay_type: 1 },
        { ...kgInfo, is_free_part: 1 }, { ...kgInfo, url: '' }]) {
        const { plugin } = load('kugou', [info]);
        await assert.rejects(plugin.getMediaSource({ id: hash }, 'standard'));
    }
});
test('酷狗歌词候选按 hash 搜索后请求 LRC，并正确解码中文', async function () {
    const { plugin, calls } = load('kugou', [
        { status: 200, candidates: [{ id: '1', accesskey: 'candidate-key' }] },
        { status: 200, fmt: 'lrc', content: Buffer.from('[00:01.00]中文歌词').toString('base64') },
    ]);
    assert.equal((await plugin.getLyric({ id: hash, duration: 57 })).rawLrc, '[00:01.00]中文歌词');
    assert.equal(calls[0].params.duration, 57000);
    assert.equal(calls[1].params.fmt, 'lrc');
});
test('酷狗无歌词和异常响应区分处理', async function () {
    const { plugin } = load('kugou', [{ status: 200, candidates: [] }, { status: 200 }]);
    assert.equal(await plugin.getLyric({ id: hash }), null);
    await assert.rejects(plugin.getLyric({ id: hash }));
});

test('QQ 搜索字段映射和分页', async function () {
    const { plugin, calls } = load('qq', [{ code: 0, data: { song: { list: [qqSong], totalnum: 31 } } }]);
    const result = await plugin.search('歌曲', 2, 'music');
    assert.equal(calls[0].params.p, 2);
    assert.equal(result.data[0].id, mid);
    assert.equal(result.data[0].mediaMid, 'media1');
    assert.equal(result.data[0].duration, 110);
    assert.match(result.data[0].artwork, /album1/);
    assert.equal(result.isEnd, true);
});
test('QQ 详情补齐和单曲链接导入', async function () {
    for (const input of [mid, 'https://y.qq.com/n/ryqq/songDetail/' + mid,
        'https://y.qq.com/n/yqq/song/' + mid + '.html']) {
        const { plugin } = load('qq', [{ code: 0, songinfo: { code: 0, data: { track_info: qqInfo } } }]);
        assert.equal((await plugin.importMusicItem(input)).id, mid);
    }
});
test('QQ 标准播放使用真实 mediaMid 并验证返回身份', async function () {
    const { plugin, calls } = load('qq', [
        { code: 0, songinfo: { code: 0, data: { track_info: qqInfo } } },
        { code: 0, req_0: { code: 0, data: { sip: ['https://audio.test/'],
            midurlinfo: [{ songmid: mid, purl: 'M500song.mp3', result: 0 }] } } },
    ]);
    assert.equal((await plugin.getMediaSource({ id: mid }, 'standard')).url, 'https://audio.test/M500song.mp3');
    const params = JSON.parse(calls[1].params.data).req_0.param;
    assert.deepEqual(Array.from(params.filename), ['M500' + mid + 'media1.mp3']);
});
test('QQ 拒绝试听、受限歌曲及错误音源身份', async function () {
    for (const info of [{ ...qqInfo, file: { ...qqInfo.file, try_end: 30 } },
        { ...qqInfo, pay: { pay_play: 1 } }]) {
        const { plugin } = load('qq', [{ code: 0, songinfo: { code: 0, data: { track_info: info } } }]);
        await assert.rejects(plugin.getMediaSource({ id: mid }, 'standard'));
    }
    const { plugin } = load('qq', [{ code: 0, songinfo: { code: 0, data: { track_info: qqInfo } } },
        { code: 0, req_0: { code: 0, data: { sip: ['https://audio.test/'],
            midurlinfo: [{ songmid: 'wrong', purl: 'song.mp3' }] } } }]);
    await assert.rejects(plugin.getMediaSource({ id: mid }, 'standard'));
});
test('QQ 原文及翻译歌词解码，无歌词正常返回 null', async function () {
    const { plugin } = load('qq', [{ code: 0, lyric: Buffer.from('[00:01.00]歌词').toString('base64'),
        trans: Buffer.from('[00:01.00]翻译').toString('base64') }, { code: 0, lyric: '', trans: '' }]);
    assert.equal((await plugin.getLyric({ id: mid })).translation, '[00:01.00]翻译');
    assert.equal(await plugin.getLyric({ id: mid }), null);
});

test('bilibili 视频搜索去高亮并转换时长', async function () {
    const { plugin } = load('bilibili', [{ code: 0, data: { b_3: 'device3', b_4: 'device4' } },
        { code: 0, data: { result: [{ bvid: bv, title: '<em>视频</em>', author: 'UP主', pic: '//img.test/cover.jpg', duration: '3:05' }], numResults: 1 } }]);
    const result = await plugin.search('视频', 1, 'music');
    assert.equal(result.data[0].id, bv + ':1');
    assert.equal(result.data[0].title, '视频');
    assert.equal(result.data[0].duration, 185);
    assert.equal(result.data[0].artwork, 'https://img.test/cover.jpg');
});
test('bilibili 导入第二 P 保留 CID、时长和唯一身份', async function () {
    const { plugin } = load('bilibili', [{ code: 0, data: biliInfo }]);
    const item = await plugin.importMusicItem('https://www.bilibili.com/video/' + bv + '?p=2');
    assert.equal(item.id, bv + ':2');
    assert.equal(item.cid, 102);
    assert.equal(item.duration, 200);
    assert.match(item.title, /下集/);
});
test('bilibili 不存在的分 P 不能回退第一 P', async function () {
    const { plugin } = load('bilibili', [{ code: 0, data: biliInfo }]);
    await assert.rejects(plugin.importMusicItem('https://www.bilibili.com/video/' + bv + '?p=3'));
});
test('bilibili 音频取流按第二 P 的 CID，返回必需 Referer', async function () {
    const { plugin, calls } = load('bilibili', [{ code: 0, data: biliInfo },
        { code: 0, data: { dash: { audio: [{ bandwidth: 64000, baseUrl: 'https://audio.test/audio.m4s' }] } } }]);
    const source = await plugin.getMediaSource({ id: bv + ':2' }, 'standard');
    assert.equal(calls[1].params.cid, 102);
    assert.match(source.headers.Referer, /bilibili/);
});
test('bilibili 没有独立音频或付费预览时不能当完整音源，字幕不作歌词', async function () {
    for (const data of [{ durl: [{ url: 'https://audio.test/video.mp4' }] },
        { is_preview: 1, dash: { audio: [{ baseUrl: 'https://audio.test/trial' }] } }]) {
        const { plugin } = load('bilibili', [{ code: 0, data: biliInfo }, { code: 0, data }]);
        await assert.rejects(plugin.getMediaSource({ id: bv + ':1' }, 'standard'));
    }
    const { plugin, calls } = load('bilibili');
    assert.equal(await plugin.getLyric({ id: bv + ':1' }), null);
    assert.equal(calls.length, 0);
});

test('bilibili 缺少标题的详情不能作为成功导入返回', async function () {
    const { plugin } = load('bilibili', [{ code: 0, data: { ...biliInfo, title: '' } }]);
    await assert.rejects(plugin.importMusicItem(bv));
});

test('歌词解码保留中文与非 BMP 字符，错误编码不返回乱码', async function () {
    const lyric = '[00:01.25]中文与音乐🎵';
    const { plugin } = load('qq', [{ code: 0, lyric: Buffer.from(lyric).toString('base64'), trans: '' },
        { code: 0, lyric: 'not-base64!', trans: '' }]);
    assert.equal((await plugin.getLyric({ id: mid })).rawLrc, lyric);
    await assert.rejects(plugin.getLyric({ id: mid }), /编码/);
});

test('bilibili 标准音轨优先第二档，只有一档时使用唯一音轨', async function () {
    const { plugin } = load('bilibili', [{ code: 0, data: biliInfo }, { code: 0, data: { dash: { audio: [
        { bandwidth: 192000, baseUrl: 'https://audio.test/high' },
        { bandwidth: 64000, baseUrl: 'https://audio.test/low' },
        { bandwidth: 128000, baseUrl: 'https://audio.test/standard' },
    ] } } }]);
    assert.equal((await plugin.getMediaSource({ id: bv + ':1' }, 'standard')).url, 'https://audio.test/standard');
});

test('酷狗取流返回短于原曲的片段时不能当作完整歌曲', async function () {
    const { plugin } = load('kugou', [{ ...kgInfo, timeLength: 30 }]);
    await assert.rejects(plugin.getMediaSource({ id: hash, duration: 180 }, 'standard'));
});

test('统一订阅仅引用存在的本地构建产物且版本一致', function () {
    const root = path.join(__dirname, '..');
    const subscription = JSON.parse(fs.readFileSync(path.join(root, 'plugins.json'), 'utf8'));
    assert.equal(subscription.plugins.length, 5);
    for (const entry of subscription.plugins) {
        const pathname = new URL(entry.url).pathname;
        const match = pathname.match(/\/plugins\/(\w+)\/dist\/plugin\.js$/);
        assert.ok(match);
        const { plugin } = load(match[1]);
        assert.equal(entry.name, plugin.platform);
        assert.equal(entry.version, plugin.version);
        assert.equal(entry.url, plugin.srcUrl);
    }
});

const qsId = '7543643914910517290';
const qsSong = { item_id: qsId, title: '原创纯音乐', author_info: { name: '作者' },
    cover_url: 'https://img.test/cover.jpg', duration: 210, lyric_info: { lyric_text: '[00:01.00]歌词' } };
function qsStream(overrides = {}, streamOverrides = {}) {
    const track = { id: qsId, duration: 210164 };
    const model = { status: 10, video_duration: 210.164, video_list: [{
        main_url: Buffer.from('https://audio.test/full.m4a').toString('base64'),
        video_meta: { quality: 'medium', bitrate: 64000, vtype: 'm4a' }, gear_des_key: 'url-access-metadata',
        ...streamOverrides,
    }], ...overrides };
    return { status_info: {}, seo_track: { track }, track_player: { video_model: JSON.stringify(model) } };
}

test('汽水搜索保留 19 位 ID，分页按 has_more 而非列表长度判断', async function () {
    const cursor = '{"offset":30,"search_id":"session-one"}';
    const { plugin, calls } = load('qishui', [
        { errno: 0, data: { list: [qsSong], has_more: true, search_params: cursor } },
        { errno: 0, data: { list: [qsSong], has_more: true, search_params: '{"offset":60}' } },
    ]);
    const result = await plugin.search('原创', 2, 'music');
    assert.equal(result.data[0].id, qsId);
    assert.equal(result.data[0].duration, 210);
    assert.equal(result.isEnd, false);
    assert.equal(calls[1].params.search_params, cursor);
    assert.equal(calls.length, 2, '首次直接请求第二页时需先取得第一页游标');
});

test('汽水后续分页复用游标，更换关键词不会复用旧游标', async function () {
    const { plugin, calls } = load('qishui', [
        { errno: 0, data: { list: [qsSong], has_more: true, search_params: 'cursor-first' } },
        { errno: 0, data: { list: [{ ...qsSong, item_id: '7280097260577523714' }], has_more: false } },
        { errno: 0, data: { list: [qsSong], has_more: false } },
    ]);
    await plugin.search('原创', 1, 'music');
    assert.equal((await plugin.search('原创', 2, 'music')).data[0].id, '7280097260577523714');
    assert.equal((await plugin.search('原创', 3, 'music')).data.length, 0);
    await plugin.search('其他歌曲', 1, 'music');
    assert.equal(calls.length, 3);
    assert.equal(calls[1].params.search_params, 'cursor-first');
    assert.equal(calls[2].params.search_params, undefined);
});

test('汽水 ID 与官方单曲链接导入不会损失精度', async function () {
    for (const input of [qsId, 'https://music.douyin.com/qishui/song/' + qsId]) {
        const { plugin } = load('qishui', [{ errno: 0, data: { list: [qsSong] } }]);
        assert.equal((await plugin.importMusicItem(input)).id, qsId);
    }
});

test('汽水明确歌词、无歌词与异常结构', async function () {
    const { plugin } = load('qishui', [
        { errno: 0, data: { list: [qsSong] } },
        { errno: 0, data: { list: [{ ...qsSong, lyric_info: { lyric_text: '' } }] } },
        { errno: 0, data: { list: [{ ...qsSong, lyric_info: { lyric_text: 7 } }] } },
    ]);
    assert.equal((await plugin.getLyric({ id: qsId })).rawLrc, '[00:01.00]歌词');
    assert.equal(await plugin.getLyric({ id: qsId }), null);
    await assert.rejects(plugin.getLyric({ id: qsId }), /歌词/);
});

test('汽水免费整曲解码 URL，URL 访问元数据本身不是音频加密标记', async function () {
    const { plugin } = load('qishui', [qsStream()]);
    assert.equal((await plugin.getMediaSource({ id: qsId }, 'standard')).url, 'https://audio.test/full.m4a');
});

test('汽水只返回试听、时长缺失、不一致或明确加密时整次失败', async function () {
    for (const model of [{ video_duration: 60.001 }, { video_duration: undefined },
        { video_duration: 0 }, { video_duration: 400 }, { spade_a: 'encrypted' }, { encrypted: true }]) {
        const { plugin } = load('qishui', [qsStream(model)]);
        await assert.rejects(plugin.getMediaSource({ id: qsId }, 'standard'));
    }
});

test('汽水错误歌曲身份、损坏 video_model 和非 HTTP 地址不可播放', async function () {
    const wrong = qsStream();
    wrong.seo_track.track.id = '7501674235158431760';
    const corrupt = qsStream();
    corrupt.track_player.video_model = 'not-json';
    for (const data of [wrong, corrupt, qsStream({}, { main_url: Buffer.from('file:///local').toString('base64') })]) {
        const { plugin } = load('qishui', [data]);
        await assert.rejects(plugin.getMediaSource({ id: qsId }, 'standard'));
    }
});

test('汽水搜索响应缺少 has_more、详情返回数字大 ID 或错误歌曲时失败', async function () {
    const { plugin } = load('qishui', [{ errno: 0, data: { list: [qsSong] } },
        { errno: 0, data: { list: [{ ...qsSong, item_id: Number(qsId) }] } },
        { errno: 0, data: { list: [{ ...qsSong, item_id: '7501674235158431760' }] } }]);
    await assert.rejects(plugin.search('原创', 1, 'music'));
    await assert.rejects(plugin.getMusicInfo({ id: qsId }));
    await assert.rejects(plugin.getMusicInfo({ id: qsId }));
});
