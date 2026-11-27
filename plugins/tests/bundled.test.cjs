const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const installBundled = require('../../src/entry/bootstrap/bundledPluginInstaller');

function harness(overrides = {}) {
    const values = new Map();
    const installed = [];
    let subscriptions = 0;
    const options = { entries: [{ name: '甲' }, { name: '乙' }],
        state: { getBoolean: key => values.get(key), set: (key, value) => values.set(key, value) },
        hasPlugin: () => false,
        install: async entry => { installed.push(entry.name); return { success: true }; },
        subscribe: async () => { subscriptions++; }, ...overrides };
    return { options, values, installed, subscriptions: () => subscriptions };
}

test('首次离线安装全部插件并登记一次订阅，再启动不覆盖或重新安装', async () => {
    const h = harness();
    assert.deepEqual(await installBundled(h.options), []);
    assert.deepEqual(h.installed, ['甲', '乙']);
    assert.equal(h.subscriptions(), 1);
    assert.deepEqual(await installBundled(h.options), []);
    assert.deepEqual(h.installed, ['甲', '乙']);
    assert.equal(h.subscriptions(), 1);
});

test('已有插件保留当前版本，用户后续卸载不会被重新添加', async () => {
    const h = harness({ hasPlugin: name => name === '甲' });
    await installBundled(h.options);
    assert.deepEqual(h.installed, ['乙']);
    h.options.hasPlugin = () => false;
    await installBundled(h.options);
    assert.deepEqual(h.installed, ['乙']);
});

test('部分安装失败不标记成功，下次仅重试失败项', async () => {
    const attempts = [];
    let failed = true;
    const h = harness({ install: async entry => {
        attempts.push(entry.name);
        return { success: entry.name !== '甲' || !failed };
    } });
    assert.deepEqual(await installBundled(h.options), ['甲']);
    assert.equal(h.values.get('installed:甲'), undefined);
    failed = false;
    assert.deepEqual(await installBundled(h.options), []);
    assert.deepEqual(attempts, ['甲', '乙', '甲']);
});

test('异常不泄露错误内容且不阻止其他插件，订阅失败下次重试', async () => {
    let attempts = 0;
    const h = harness({ install: async entry => {
        if (entry.name === '甲') throw new Error('private-path');
        return { success: true };
    }, subscribe: () => { if (++attempts === 1) throw new Error('offline'); } });
    assert.deepEqual(await installBundled(h.options), ['甲', '内置订阅']);
    assert.deepEqual(await installBundled(h.options), ['甲']);
    assert.equal(attempts, 2);
    assert.equal(h.values.get('installed:乙'), true);
});

test('个人版 APK 资源完整打包六源且与插件产物逐字一致', () => {
    const root = path.resolve(__dirname, '../..');
    const dir = path.join(root, 'android/app/src/personal/assets/bundled-plugins');
    const entries = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    assert.equal(entries.length, 6);
    assert.equal(new Set(entries.map(e => e.name)).size, 6);
    assert.ok(!entries.some(e => /lrts/.test(e.filename)));
    for (const entry of entries) {
        const name = entry.filename.replace(/\.js$/, '');
        assert.equal(entry.asset, 'bundled-plugins/' + entry.filename);
        assert.equal(fs.readFileSync(path.join(dir, entry.filename), 'utf8'),
            fs.readFileSync(path.join(root, 'plugins', name, 'dist/plugin.js'), 'utf8'));
    }
});
