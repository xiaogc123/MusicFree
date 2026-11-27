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
        const data = replies.shift();
        if (data instanceof Error) throw data;
        return { data };
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', name, 'dist/plugin.js'), 'utf8'), {
        module, URL, require: function (id) { assert.equal(id, 'axios'); return axios; },
    });
    return { plugin: module.exports, calls };
}

const xm = i => ({ trackId: i, albumId: 12, orderNo: i, title: '章节' + i, duration: 60, nickname: '主播',
    albumTitle: '书籍', coverMiddle: 'https://img.test/a.jpg', isPaid: false });
const xmPage = (list, total = list.length, page = 1) => ({ ret: 0, data: { list, totalCount: total, pageId: page, pageSize: 100 } });
const lrBook = { apiStatus: 0, status: 0, id: 12, baseEntityId: 12, name: '书籍', sections: 3, announcer: '主播', cover: 'https://img.test/a.jpg' };
const lr = i => ({ id: 9159893300000000, sectionId: '915989330000000' + i, section: i, name: '章节' + i,
    length: 60, payType: 0, feeType: 0, listenPrice: '0', cantListen: 0, tmeId: '100' + i });
const lrPage = (list, total = list.length) => ({ apiStatus: 0, status: 0, bookId: 12, sections: total, list });

for (const name of ['ximalaya', 'lrts']) {
    test(name + ' 仅支持书籍专辑搜索，无效输入与后续宿主页不发请求', async function () {
        const { plugin, calls } = load(name);
        assert.deepEqual(Array.from(plugin.supportedSearchType), ['album']);
        assert.equal(plugin.defaultSearchType, 'album');
        assert.equal((await plugin.search(' ', 1, 'album')).data.length, 0);
        assert.equal((await plugin.search('书', 1, 'music')).data.length, 0);
        await assert.rejects(plugin.search('书', 0, 'album'));
        await assert.rejects(plugin.getAlbumInfo({ id: 'bad' }, 1));
        assert.equal((await plugin.getAlbumInfo({ id: '12' }, 2)).musicList.length, 0);
        assert.equal(await plugin.getMediaSource({ id: 'bad' }, 'high'), null);
        assert.equal(await plugin.getLyric({ id: name === 'lrts' ? '12:1' : '1' }), null);
        assert.equal(calls.length, 0);
    });
    test(name + ' 搜索网络和错误结构不能伪装为空', async function () {
        for (const response of [new Error('private-token'), {}, { status: 0 }]) {
            const { plugin } = load(name, [response]);
            await assert.rejects(plugin.search('书', 1, 'album'), e => !e.message.includes('private-token'));
        }
    });
}

test('喜马拉雅书籍搜索分页与字段映射', async function () {
    const { plugin, calls } = load('ximalaya', [{ ret: 200, data: { result: { response: { numFound: 21,
        docs: [{ id: 12, title: '<em>书籍</em>', tracks: 3, cover_path: '//img.test/a.jpg', nickname: '主播' }] } } } }]);
    const result = await plugin.search('书', 2, 'album');
    assert.equal(result.data[0].worksNum, 3);
    assert.equal(result.data[0].artwork, 'https://img.test/a.jpg');
    assert.equal(calls[0].params.page, 2);
});

test('喜马拉雅 1203 章完整读取且顺序一致，无固定上限', async function () {
    const tracks = Array.from({ length: 1203 }, (_, i) => xm(i + 1));
    const replies = [];
    for (let i = 0; i < tracks.length; i += 100) replies.push(xmPage(tracks.slice(i, i + 100), tracks.length, i / 100 + 1));
    replies.push(xmPage(tracks.slice(0, 100), tracks.length));
    const { plugin } = load('ximalaya', replies);
    const result = await plugin.getAlbumInfo({ id: '12', worksNum: 1203 }, 1);
    assert.equal(result.musicList.length, 1203);
    assert.equal(result.musicList[1202].id, '1203');
    assert.equal(result.isEnd, true);
});

test('喜马拉雅缺章、重复、乱序、归属异常与结束快照变化整次失败', async function () {
    for (const replies of [[xmPage([xm(1)], 2)], [xmPage([xm(1), xm(1)])], [xmPage([xm(2)])],
        [xmPage([{ ...xm(1), albumId: 99 }])], [xmPage([xm(1)]), xmPage([{ ...xm(1), title: '变化' }])]]) {
        await assert.rejects(load('ximalaya', replies).plugin.getAlbumInfo({ id: '12' }, 1));
    }
});

test('喜马拉雅详情与标准音源重新核对身份、权限、试听与时长', async function () {
    const data = { id: 1, album_id: 12, title: '章节', duration: 60, is_paid: false, play_path_64: 'https://audio.test/a.m4a' };
    const { plugin } = load('ximalaya', [data, data]);
    assert.equal((await plugin.getMusicInfo({ id: '1' })).id, '1');
    assert.equal((await plugin.getMediaSource({ id: '1', duration: 60 })).url, data.play_path_64);
    for (const bad of [{ ...data, id: 2 }, { ...data, is_paid: true }, { ...data, isSample: true },
        { ...data, duration: 30 }, { ...data, play_path_64: 'file:///a' }]) {
        await assert.rejects(load('ximalaya', [bad]).plugin.getMediaSource({ id: '1', duration: 60 }));
    }
});

test('懒人听书搜索与目录保留大整数 sectionId，章节身份不使用失真数字 id', async function () {
    const list = [lr(1), lr(2), lr(3)];
    const { plugin, calls } = load('lrts', [{ apiStatus: 0, status: 0, count: 1, hasNext: 0, list: [lrBook] },
        lrBook, lrPage(list), lrPage(list)]);
    const book = (await plugin.search('书', 1, 'album')).data[0];
    const result = await plugin.getAlbumInfo(book, 1);
    assert.deepEqual(Array.from(result.musicList, s => s.id), ['12:1', '12:2', '12:3']);
    assert.equal(result.musicList[0].resourceId, '9159893300000001');
    assert.notEqual(result.musicList[0].resourceId, result.musicList[1].resourceId);
    assert.equal(calls[2].params.sortType, 0);
});

test('懒人听书 1203 章跨批次完整返回，付费章节不从目录删除', async function () {
    const book = { ...lrBook, sections: 1203 };
    const tracks = Array.from({ length: 1203 }, (_, i) => ({ ...lr(i + 1), sectionId: '900000000000' + String(i + 1).padStart(5, '0'), payType: 1 }));
    const replies = [book];
    for (let i = 0; i < tracks.length; i += 50) replies.push(lrPage(tracks.slice(i, i + 50), 1203));
    replies.push(lrPage(tracks.slice(0, 50), 1203));
    const result = await load('lrts', replies).plugin.getAlbumInfo({ id: '12' }, 1);
    assert.equal(result.musicList.length, 1203);
    assert.equal(result.musicList[1202].id, '12:1203');
    assert.equal(result.musicList[1202].restricted, true);
});

test('懒人听书缺章、重复、失真资源 ID 与读取期间变化不能作为完整目录', async function () {
    for (const list of [[lr(1)], [lr(1), lr(1), lr(3)], [lr(1), { ...lr(2), sectionId: 9159893300000002 }, lr(3)]]) {
        await assert.rejects(load('lrts', [lrBook, lrPage(list, 3)]).plugin.getAlbumInfo({ id: '12' }, 1));
    }
    await assert.rejects(load('lrts', [lrBook, lrPage([lr(1), lr(2), lr(3)]), lrPage([], 4)]).plugin.getAlbumInfo({ id: '12' }, 1));
});

test('懒人听书真实登录错误明确提示，付费与不明时长均不能返回音源', async function () {
    const { plugin, calls } = load('lrts', [lrBook, lrPage([lr(1)]), { apiStatus: 485, status: 485 }]);
    await assert.rejects(plugin.getMediaSource({ id: '12:1' }), /需要登录/);
    assert.equal(calls[2].params.resId, '9159893300000001');
    for (const source of [{ apiStatus: 0, status: 0, data: { path: 'https://audio.test/a.mp3' } },
        { apiStatus: 0, status: 0, data: { path: 'https://audio.test/a.mp3', duration: 30 } }]) {
        await assert.rejects(load('lrts', [lrBook, lrPage([lr(1)]), source]).plugin.getMediaSource({ id: '12:1' }), /完整章节/);
    }
    const restricted = load('lrts', [lrBook, lrPage([{ ...lr(1), payType: 1 }])]);
    await assert.rejects(restricted.plugin.getMediaSource({ id: '12:1' }), /权限/);
    assert.equal(restricted.calls.length, 2);
});

test('可用订阅只添加喜马拉雅，未验证播放的懒人听书不混入', function () {
    const subscription = JSON.parse(fs.readFileSync(path.join(__dirname, '../plugins.json'), 'utf8'));
    assert.ok(subscription.plugins.some(p => p.name === '喜马拉雅（公开有声书）'));
    assert.ok(!subscription.plugins.some(p => p.url.includes('/lrts/')));
});

test('两源后续批次网络失败或声明总数变化均不返回首批章节', async function () {
    const first = Array.from({ length: 100 }, (_, i) => xm(i + 1));
    for (const next of [new Error('offline'), xmPage([xm(101)], 102, 2)]) {
        await assert.rejects(load('ximalaya', [xmPage(first, 101), next]).plugin.getAlbumInfo({ id: '12' }, 1));
    }
    const list = Array.from({ length: 50 }, (_, i) => ({ ...lr(i + 1), sectionId: '900000000000' + String(i + 1).padStart(5, '0') }));
    for (const next of [new Error('offline'), lrPage([lr(51)], 52)]) {
        await assert.rejects(load('lrts', [{ ...lrBook, sections: 51 }, lrPage(list, 51), next]).plugin.getAlbumInfo({ id: '12' }, 1));
    }
});
