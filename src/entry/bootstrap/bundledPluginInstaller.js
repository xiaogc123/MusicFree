// 状态逐项持久化：失败可重试，成功后不恢复用户主动删除的插件。
module.exports = async function installBundledPlugins(options) {
    const { entries, state, hasPlugin, install, subscribe } = options;
    const failures = [];
    for (const entry of entries) {
        const key = 'installed:' + entry.name;
        if (state.getBoolean(key)) continue;
        try {
            if (!hasPlugin(entry.name)) {
                const result = await install(entry);
                if (!result.success) throw new Error(result.message || '插件安装失败');
            }
            state.set(key, true);
        } catch (_) {
            failures.push(entry.name);
        }
    }
    if (!state.getBoolean('subscription')) {
        try {
            await subscribe();
            state.set('subscription', true);
        } catch (_) {
            failures.push('内置订阅');
        }
    }
    return failures;
};
