# 网易云音乐匿名插件

独立的 MusicFree CommonJS 插件，提供歌曲搜索、标准音质播放、原文与翻译歌词、单曲导入。不需要账号、Cookie 或自建服务。

## 在线安装与更新

在 MusicFree「插件设置 → 从网络安装插件」中填写：

```text
https://raw.githubusercontent.com/xiaogc123/MusicFree/master/plugins/netease/dist/plugin.js
```

插件 `srcUrl` 指向同一地址，支持应用内检查更新。后续修改需递增 `src/index.js` 与 `package.json` 的版本号，重新构建，并将源码与 `dist/plugin.js` 一同提交。仅该插件产物加入版本管理，其他构建输出仍忽略。

## 构建与验证

在本目录使用 Node.js 18 及以上版本执行，无需安装依赖：

```powershell
npm run build
npm test
npm run test:live
```

`dist/plugin.js` 为生成的单文件产物。在 MusicFree「插件设置 → 从本地安装插件」中选择该文件。构建不包含网络请求，离线测试直接加载构建产物并替换外部 HTTP 边界。真实接口测试使用 Node.js Fetch 实现测试用 GET 适配器，不代表宿主 Axios 或 Android 播放器验收。

## 使用范围

- 搜索只支持歌曲，每页 30 首。
- 播放只提供标准音质，其他音质返回不可用；建议在播放器设置中选择标准音质。
- 播放地址按需获取，歌曲无匿名完整地址或只提供试听时明确失败。
- 单曲导入支持正整数歌曲 ID、`https://music.163.com/song?id=数字`、`https://music.163.com/#/song?id=数字` 和 `/m/song` 链接。
- 短链接需先在浏览器展开；歌单链接不属于单曲导入范围。
- 无歌词时返回空结果；网络、接口失败与响应结构异常会报告错误。

运行时只使用 MusicFree 内置的 `axios` 与 `URL`。源码使用 JavaScript CommonJS；构建使用 Node.js 标准库合并本地模块并检查语法，不依赖 Parcel 或 TypeScript 编译器。不支持登录、私密歌单、歌单导入和多音质。

## 接口与参考

这些接口不是带稳定性承诺的开放 API，结果受网易云接口变更、网络、地区与歌曲权限影响。

| 能力 | 请求路径 |
| --- | --- |
| 搜索 | `/api/search/get/web` |
| 标准音源 | `/api/song/enhance/player/url` |
| 歌词 | `/api/song/lyric` |
| 单曲详情 | `/api/v3/song/detail` |

协议参考：[MusicFree](https://musicfree.catcat.work/plugin/protocol.html) 。接口参考：[API Enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced/tree/main/module) 、[匿名插件参考](https://github.com/IT-cainiao/musicfree-netease) 。参考实现的接口存在不代表插件已通过端内验收，实际状态见根目录 `ROADMAP.md`。
