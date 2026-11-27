# 酷狗音乐匿名插件

源码位于 `src/index.js`，使用上级 `npm run build` 生成独立的 `dist/plugin.js`，运行时只使用 MusicFree 内置 Axios。

支持歌曲搜索、标准音源、LRC 歌词、歌曲详情与单曲导入。导入输入为 32 位歌曲 hash，或 `https://www.kugou.com/song/#hash=歌曲hash`。短链接需先展开。不提供歌单导入。

歌词按歌曲 hash 查找候选，再请求 LRC；不依赖 Node.js Buffer、原生压缩库或 KRC 解压。没有候选返回无歌词，接口结构异常报告失败。当前不提供翻译歌词。

支持正式专辑搜索和全部曲目详情，逐页核对总数、重复与归属，失败不返回部分列表。专辑详情接口的 `songcount` 实测可能为 0，使用曲目接口 `total`，并与搜索结果数量核对；受限歌曲仍保留在专辑列表。

专辑接口使用 `http://mobilecdn.kugou.com`，HTTPS 实测证书主机名不匹配，未绕过证书校验。当前 Android 工程允许明文请求；其他客户端或网络策略可能限制 HTTP，仍需端内验收。

播放只接受匿名免费完整音源；无地址、付费或试听标记会失败。完整音源可用性由平台决定。安装和验证命令见上级 `README.md`。
