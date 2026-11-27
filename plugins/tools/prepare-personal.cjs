const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const names = ['netease', 'kugou', 'qq', 'bilibili', 'qishui', 'ximalaya'];
const subscription = JSON.parse(fs.readFileSync(path.join(root, 'plugins/plugins.json'), 'utf8'));
if (subscription.plugins.length !== names.length) throw new Error('内置清单必须与已验证六源一致');
const target = path.join(root, 'android/app/src/personal/assets/bundled-plugins');
const entries = names.map(function (name) {
    const source = fs.readFileSync(path.join(root, 'plugins', name, 'dist/plugin.js'), 'utf8');
    const module = { exports: {} };
    vm.runInNewContext(source, { module, URL, require: function (id) {
        if (id !== 'axios') throw new Error('Unexpected dependency: ' + id);
        return {};
    } });
    const plugin = module.exports;
    const item = subscription.plugins.find(p => p.url === plugin.srcUrl);
    if (!item || item.name !== plugin.platform || item.version !== plugin.version) throw new Error('订阅与产物不一致：' + name);
    return { name: plugin.platform, filename: name + '.js', asset: 'bundled-plugins/' + name + '.js', source };
});
fs.mkdirSync(target, { recursive: true });
for (const entry of entries) fs.writeFileSync(path.join(target, entry.filename), entry.source);
fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(entries.map(({ source, ...entry }) => entry), null, 2) + '\n');
console.log('Prepared six offline plugin assets: ' + target);
