# MusicFree 独立音源订阅

本地可用订阅包含网易云、酷狗、QQ 音乐、bilibili、汽水及喜马拉雅六个独立插件。汽水仅播放能够确认完整时长、无明确加密标记的公开音源。懒人听书已有本地适配，但播放需要登录，未列入可用订阅。

## 构建与验证

Node.js 18 及以上版本，无需安装依赖。在本目录运行：

```powershell
npm run build
npm test
npm run test:live
npm run test:albums
npm run test:audiobooks
```

上述构建打包独立插件，并根据已验证可用产物的名称、版本和 `srcUrl` 生成 `plugins.json`；懒人听书只构建、不加入订阅。网易云沿用其独立构建及测试：

```powershell
npm --prefix netease run build
npm --prefix netease test
```

网易云有变更时先构建网易云，再构建本目录，确保订阅读取最新产物。更新任何插件都需同步递增插件版本并重新构建。

## 安装

可在 MusicFree「从本地安装插件」中分别选择各目录的 `dist/plugin.js`。`plugins.json` 是标准订阅清单；在文件推送到仓库后，通过「订阅」添加以下地址并更新订阅：

```text
https://raw.githubusercontent.com/xiaogc123/MusicFree/refs/heads/master/plugins/plugins.json
```

线上地址只有推送后才会反映本地生成结果。清单中每个插件可单独安装、更新或禁用。首次安装建议选择标准音质。

## 能力与限制

| 音源 | 搜索／详情／导入 | 标准音源 | 歌词 |
| --- | --- | --- | --- |
| 网易云 | 歌曲、正式专辑、单曲及公开歌单 | 匿名可用完整音源 | 原文、翻译 |
| 酷狗 | 歌曲、正式专辑、hash 单曲 | 匿名免费完整音源 | 原生 LRC |
| QQ 音乐 | 歌曲、正式专辑、songmid 单曲 | 匿名免费完整音源 | 原文、翻译 |
| bilibili | 视频、视频专辑与全部分 P、BV 单曲 | 独立音频流 | 视频无原生歌曲歌词，返回无歌词 |
| 汽水 | 歌曲、字符串 ID 单曲 | 可确认完整时长的匿名音源 | 原生歌词，纯音乐可无歌词 |
| 喜马拉雅 | 书籍专辑、完整章节目录与详情 | 公开免费章节 | 无原生歌词 |

有声书选择「专辑」搜索书名或主播，打开后按章播放。目录缺章或请求失败会明确报错；付费和试听章节不冒充完整音频。断点续听、连续播放及定时停止取决于宿主，插件不修改播放器。喜马拉雅已加入线上六源订阅，更新原订阅即可获取。

新插件暂不提供歌单／收藏夹导入、登录或多音质。bilibili 不将字幕、标题猜测或其他版本歌词冒充当前视频歌词。接口未返回翻译时不会生成翻译。

专辑入口可搜索歌手或专辑名；网易云、QQ、酷狗返回正式专辑，bilibili 返回视频并展开全部分 P，不自动切分单 P 长视频，也不展开跨视频合集。专辑详情核对完整性，缺歌、重复、数量变化或请求失败时整次失败；列表包含受限曲目，完整收录不代表全部可匿名播放。

汽水暂未启用专辑搜索：匿名搜索接口以 `search_type=album` 实测为空，尚未验证可用的专辑搜索路线。酷狗专辑接口目前使用 HTTP，HTTPS 证书主机名不匹配；不跳过证书验证，端内可达性待验收。

接口属于平台客户端接口，存在变更、地区和风控限制。受限、付费或标记为试听的音源不作为完整音源返回。并非所有搜索结果都能匿名播放。

汽水 PC 签名接口与匿名接口是不同路线；本插件不要求 Cookie、签名器或自建服务，不提供受限歌曲整曲。搜索按服务端 `search_params` 游标续传，不能用普通页码偏移代替。

离线测试加载最终单文件并模拟 HTTP 边界；联网测试使用 Node.js Fetch 适配 GET 请求，验证分页、歌词、身份和音频字节读取。该验证不代表 Android Hermes、真实 Axios／URL polyfill 或端内播放已经验收。

## 参考实现

接口及字段参考了 [QQMusicApi](https://github.com/jsososo/QQMusicApi/tree/master/routes) 、[酷狗参考](https://github.com/guohuiyuan/music-lib/tree/main/kugou) 、[官方 bilibili 示例](https://github.com/maotoumao/MusicFreePlugins/blob/v0.1/plugins/bilibili/index.ts) 。源码按当前项目结构实现，没有下载并执行第三方插件。
