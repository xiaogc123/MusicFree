# 个人自用构建

基于当前仓库 `0.6.2` 源码，不是官方 `1.0.0-beta.4` 的重打包版本。不发布应用商店，不修改官方签名或使用其私钥。

个人构建参数 `-PpersonalBuild=true`：包名 `fun.upup.musicfree.personal`，名称「MusicFree 个人版」，版本后缀 `-personal`，仅 ARM64。默认构建维持原包名、名称和签名路径。

个人版以 Android assets 内置网易云、酷狗、QQ、bilibili、汽水和喜马拉雅。首次启动配置及插件管理器初始化完成后，按已有本地安装流程安装；不需要联网下载插件代码。状态逐源持久化，失败项下次重试，已存在插件保留；成功安装后用户主动卸载的插件不会被启动流程恢复。

初始化时登记六源订阅，保留其他订阅。之后从应用内更新插件，内置旧代码不会覆盖更新版本。懒人听书仍未加入可用订阅。

```powershell
npm --prefix plugins/netease run build
npm --prefix plugins run build
npm --prefix plugins run prepare:personal
npm --prefix plugins run test:personal
# 配好进程级 Android SDK 路径后，在 android 目录执行：
.\gradlew.bat assembleRelease -PpersonalBuild=true -PreactNativeArchitectures=arm64-v8a
```

个人版 Gradle 构建会重新准备六源 assets，产物目录在 `android/app/build/outputs/apk/release/`。assets 是生成文件，不加入版本管理，来源为已验证的独立插件产物。

此阶段构建输出为未签名 APK。生成个人签名密钥需用户单独确认；密钥和凭据仅存于忽略的本地目录，不能提交。签名与官方不同，独立包名允许并存，但不会自动迁移官方版歌单和数据。保留同一私钥才能持续覆盖更新个人版。

用户已确认签名当前测试包。签名目录约定为 `android/.signing-personal/`：`personal.p12` 保存加密私钥，`password.txt` 保存随机生成的本地密码；整个目录加入 Git 忽略，不打印密码，不覆盖既有密钥。签名 APK 放在忽略目录 `tmp/personal-build/output/`，与未签名产物分开保存。

SDK、包管理器工具和缓存仅放项目 `tmp/personal-build/`，通过构建进程环境变量指定，不修改全局 PATH 或系统配置。Android 16 安装、16 KB ELF 对齐、插件离线初始化、重启、播放及后台运行必须分别验证；未完成原生构建前不能宣称 APK 已交付。

当前 `0.76.5` React Native／Hermes 预编译包的 7 个 ARM64 核心库未达到 16 KB ELF 对齐，不能宣称完整支持 16 KB 设备。用户暂无设备，本轮先生成个人测试包；不把无设备静态检查视为 Android 16 安装与运行验收。

本机构建遇到 Maven Central 大 AAR 下载缓慢，使用 React Native 官方 `-Preact.internal.mavenLocalRepo=本地目录` 参数读取项目临时目录中的同版本发布包；预取文件均与原始 Maven 模块元数据 SHA-512 一致，未替换版本或关闭证书校验。
