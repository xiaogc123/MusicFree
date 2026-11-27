import { Platform } from "react-native";
import DeviceInfo from "react-native-device-info";
import { copyFileAssets, readFileAssets } from "react-native-fs";
import PluginManager from "@/core/pluginManager";
import Config from "@/core/appConfig";
import pathConst from "@/constants/pathConst";
import getOrCreateMMKV from "@/utils/getOrCreateMMKV";
import Toast from "@/utils/toast";

const installBundledPlugins = require("./bundledPluginInstaller");
const subscriptionUrl = "https://raw.githubusercontent.com/xiaogc123/MusicFree/refs/heads/master/plugins/plugins.json";

export default async function setupBundledPlugins() {
    if (Platform.OS !== "android" || DeviceInfo.getBundleId() !== "fun.upup.musicfree.personal") return;
    try {
        const entries = JSON.parse(await readFileAssets("bundled-plugins/manifest.json", "utf8"));
        const failures = await installBundledPlugins({
            entries,
            state: getOrCreateMMKV("App.BundledPlugins"),
            hasPlugin: (name: string) => !!PluginManager.getByName(name),
            install: async (entry: { asset: string; filename: string }) => {
                const file = pathConst.cachePath + entry.filename;
                await copyFileAssets(entry.asset, file);
                return PluginManager.installPluginFromLocalFile(file);
            },
            subscribe: () => {
                // 首次有其他订阅时保留；完成后不重新添加用户删除的订阅。
                const current = Config.getConfig("plugin.subscribeUrl");
                let entries: Array<{ name: string; url: string }> = [];
                if (current) {
                    try { entries = JSON.parse(current); } catch { entries = [{ name: "原有订阅", url: current }]; }
                    if (!Array.isArray(entries)) throw new Error("订阅配置格式异常");
                }
                if (!entries.some((entry: { url: string }) => entry.url === subscriptionUrl)) {
                    Config.setConfig("plugin.subscribeUrl", JSON.stringify([...entries, { name: "个人六源", url: subscriptionUrl }]));
                }
            },
        });
        if (failures.length) Toast.warn("内置插件初始化失败，下次启动重试：" + failures.join("、"));
    } catch (_) {
        Toast.warn("内置插件读取失败，请在插件设置中添加六源订阅");
    }
}
