# 项目技能

## musicfree-plugin-dev

- 来源：`https://github.com/maotoumao/musicfree-skills/tree/8767a70e9fbfc4f17c50d04618291a5e7e6c9a9d/skills/musicfree-plugin-dev`。
- 上游提交：`8767a70e9fbfc4f17c50d04618291a5e7e6c9a9d`。
- 安装日期：2026-11-27。
- 通过 Codex `skill-installer` 安装至本项目，未修改全局技能目录。
- `SKILL.md` 与 `references/` 三份参考文档共四个文件均已审查，安装内容逐字节匹配审查快照，保留上游原文。
- 上游仓库许可证：AGPL-3.0。

## 安装审查

- 作者：MusicFree 作者 `maotoumao`；查询时仓库 69 stars，最后更新时间为 2026-11-24。
- 风险等级：中等，文档包含网络分析、浏览器抓包、依赖安装和发布示例。
- 审查结论：可以安装为项目参考，未发现可执行钩子、混淆载荷、隐藏上传或读取用户凭据文件的代码。
- 文件范围：仅技能目录；网络用于下载固定版本的官方文档。示例脚本、Cookie 示例、Playwright 安装与发布命令均未执行。
- 实际执行以用户授权与根目录 `AGENTS.md` 为准，不自动扩展功能、安装依赖或发布。

## 当前移动端适用性

- 当前加载器使用 `Function`，不能套用文档中 `vm.createContext` 与每次方法十秒超时的描述。
- 当前类型和调用方允许无歌词或不可用音质返回 `null`，与文档一律禁止 `null` 的写法不同。
- 当前 `lrc` 为旧版歌词 URL 字段，`rawLrc` 才是歌词文本；文档将两者视为等价的表格不适用于当前实现。
- 插件仅实现用户要求的五项能力，文档中“能适配的全部实现”不扩展授权范围。
