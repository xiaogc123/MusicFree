# 网易云音乐匿名插件

独立的 MusicFree CommonJS 插件，提供歌曲搜索、标准音质播放、原文与翻译歌词、单曲和公开歌单完整导入。不需要账号、Cookie 或自建服务。

## 在线安装与更新

在 MusicFree「插件设置 → 从网络安装插件」中填写：

```text
https://raw.githubusercontent.com/xiaogc123/MusicFree/master/plugins/netease/dist/plugin.js
```

插件 `srcUrl` 指向同一地址，支持应用内检查更新。后续修改需递增 `src/index.js` 与 `package.json` 的版本号，重新构建，并将源码与 `dist/plugin.js` 一同提交。仅该插件产物加入版本管理，其他构建输出仍忽略。

若推送后原地址仍命中旧版缓存，可用同一分支的完整引用地址安装：

```text
https://raw.githubusercontent.com/xiaogc123/MusicFree/refs/heads/master/plugins/netease/dist/plugin.js
```

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
- 搜索接口可能不返回封面；播放时宿主通过 `getMusicInfo` 获取详情，补齐封面、歌手、专辑和时长。搜索列表不会逐首请求详情。
- 播放只提供标准音质，其他音质返回不可用；建议在播放器设置中选择标准音质。
- 播放地址按需获取，歌曲无匿名完整地址或只提供试听时明确失败。
- 单曲导入支持正整数歌曲 ID、`https://music.163.com/song?id=数字`、`https://music.163.com/#/song?id=数字` 和 `/m/song` 链接。
- 歌单导入支持正整数歌单 ID、`https://music.163.com/playlist?id=数字`、`https://music.163.com/#/playlist?id=数字` 和 `/m/playlist` 链接。在插件管理中选择「导入歌单」。
- 大歌单按完整 ID 列表每批 50 首顺序获取详情，没有 1000 首总量限制，返回结果严格保留歌单顺序。接口的 ID 请求量为 100000；若服务器截断 ID 列表，数量核对失败后停止，不把它当成完整歌单。
- 导入结束前再次核对完整 ID 序列。缺歌、重复、接口失败或歌单增删重排时，整次失败，不返回部分歌曲；可修复源歌单或稍后重试。
- 导入歌曲信息不等于取得播放权限，会员或下架歌曲仍受播放接口限制。
- 短链接需先在浏览器展开；歌单链接不属于单曲导入范围。
- 无歌词时返回空结果；网络、接口失败与响应结构异常会报告错误。

运行时只使用 MusicFree 内置的 `axios` 与 `URL`。源码使用 JavaScript CommonJS；构建使用 Node.js 标准库合并本地模块并检查语法，不依赖 Parcel 或 TypeScript 编译器。不支持登录、私密歌单和多音质。

当前移动端宿主会将插件导入异常转换为空数组，界面显示导入失败或链接无效；具体缺失原因在插件异常及宿主日志中。插件只有全部校验通过才返回歌曲，不会把部分数据交给导入确认页。空歌单也会被现有界面视作无可导入歌曲。

## 接口与参考

这些接口不是带稳定性承诺的开放 API，结果受网易云接口变更、网络、地区与歌曲权限影响。

| 能力 | 请求路径 |
| --- | --- |
| 搜索 | `/api/search/get/web` |
| 标准音源 | `/api/song/enhance/player/url` |
| 歌词 | `/api/song/lyric` |
| 单曲详情 | `/api/v3/song/detail` |
| 公开歌单 ID 列表 | `/api/v6/playlist/detail` |

协议参考：[MusicFree](https://musicfree.catcat.work/plugin/protocol.html) 。接口参考：[API Enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced/tree/main/module) 、[匿名插件参考](https://github.com/IT-cainiao/musicfree-netease) 。参考实现的接口存在不代表插件已通过端内验收，实际状态见根目录 `ROADMAP.md`。
