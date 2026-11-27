# QQ 音乐匿名插件

源码位于 `src/index.js`，使用上级 `npm run build` 生成独立的 `dist/plugin.js`，运行时只使用 MusicFree 内置 Axios。

支持歌曲搜索、标准音源、原文及翻译歌词、歌曲详情与单曲导入。输入支持 14 位 songmid，以及 `https://y.qq.com/n/ryqq/songDetail/songmid`、`https://y.qq.com/n/yqq/song/songmid.html` 链接。短链接需先展开。不提供歌单导入。

播放先按 songmid 获取详情及 mediaMid，再请求标准 MP3 的 vkey；不会将 songmid 与 mediaMid 混用，不提供会员或试听音源。歌词 Base64 按 UTF-8 解码，翻译仅在接口提供时返回。

支持正式专辑搜索和详情。详情按实际已获取数量续取全部曲目，核对专辑身份、总数、重复与歌曲归属；缺歌、总数变化或后续请求失败时整次失败。专辑内受限歌曲仍保留，播放权限由平台决定。

安装和验证命令见上级 `README.md`。无需账号或 Cookie，部分歌曲不能匿名播放。
