# Phigros Data Studio

`Phigros Data Studio` 是 Android Tool Suite 的普通 format v3 插件。3.0 使用声明式 WebView UI 和受限 JavaScript Worker，不包含 `plugin.apk`，网络、文件保存、后台任务与宿主存储全部经过 Capability Router。

## 功能

- SessionToken 获取
  - TapTap 国服/国际服扫码登录。
  - 同屏显示二维码、剩余时间和浏览器打开入口。
  - 登录成功后自动换取 Phigros SessionToken。
- SessionToken 本地管理
  - 支持多个令牌、备注、国服/国际服标记、切换和删除。
  - 使用 Android Keystore 的 AES-GCM 密钥加密；界面不回显明文。
- 云存档查分
  - 直接读取 Phigros LeanCloud 最新云存档。
  - 本地解压并解析 `gameRecord`、`gameProgress`、`user` 与存档 `summary`。
  - 每个令牌最近一次成功同步的完整存档和推分结果会保存在应用私有目录；重新打开或切换账号时先立即恢复历史与存档，只有主动同步才会联网更新。
  - 展示玩家信息、Data、课题模式、按难度统计的 Clear/FC/Phi。
- Bn / B30
  - RKS 列表直接展示全部有效成绩，支持曲名/ID 搜索与 EZ/HD/IN/AT 筛选。
  - B30 使用 `P3 + B27` 口径。
  - 每条成绩展示难度、定数、分数、准确率、评级、推分 ACC 和单曲 RKS。
  - 推分 ACC 通过完整重算 P3+B27 后二分求解，不只比较第 27 名边界。
- 图片生成
  - 生成双列 B30 长图，包含 P3/B27、曲绘、成绩、ACC、推分 ACC 与单曲 RKS。
  - 生成个人信息效果图，包含 RKS、课题模式、Data、难度统计和 Top Records。
  - 图片署名自动使用当前插件版本，不使用参考项目的作者署名。
  - 生成后在独立大图弹窗中预览；点击“保存图片”后通过系统文件保存器选择位置，取消保存不会影响成绩数据。
- 推分时间线
  - 每次同步后比较上一次本地成绩，记录 RKS、课题模式和谱面提升。
  - 标记“新成绩”“进入 B27”“进入 P3”和“成绩提升”。
  - 每个节点默认显示 5 条提升，可展开查看全部记录及新旧分数、ACC。
  - 按本地令牌隔离历史，支持 30/90/180 天及全部范围。
- 定数表
  - 使用 phi-plugin 当前曲库数据，支持曲名/ID 搜索和 EZ/HD/IN/AT 组合筛选。
  - 按整数定数段分组并在组内按实际定数降序排列。
  - 曲库会缓存到本机，可在插件中手动更新。

RKS 列表与定数表每页显示 40 项，搜索和难度筛选作用于完整数据；推分 ACC 在显示相应成绩时计算并缓存。

## 使用

1. 在“令牌”页选择国服或国际服。
2. 使用 TapTap 扫码，或手动输入 25 位 SessionToken 并保存。
3. 返回“总览”点击“同步云存档”。
4. 在“RKS 列表”“B30”“时间线”“定数表”之间切换。
5. 在“总览”或“B30”页生成图片，确认预览后点击“保存图片”，选择文件保存位置。

历史记录从本插件首次成功同步后开始产生。每个历史节点使用该次同步时缓存的曲库定数，游戏版本变更后不会自动追溯改写旧节点。

## 计算规则

单曲 RKS：

```text
ACC < 55%  => 0
ACC >= 55% => 定数 × ((ACC - 55) / 45)²
```

整体 RKS：

```text
(最高 3 个满分谱面 RKS + 最高 27 个谱面 RKS) / 30
```

推分 ACC 的目标是达到下一个可显示的 0.01 RKS 舍入阈值。插件会将目标谱面 ACC 在“当前值到 100%”之间二分搜索，并在每一步重新计算整个 P3+B27；100% 仍无法达到阈值时显示“无法推分”。

## 隐私和安全

- SessionToken 只发送给 TapTap/Phigros 使用的官方账户与 LeanCloud 接口，不会提交到参考查分站。
- SessionToken 使用宿主 SecretStore 的 Android Keystore AES-GCM 加密，并同步保留可备份的敏感 Dataset。
- 成绩快照、推分时间线和曲库缓存保存在宿主按插件隔离、原子切换的 Dataset generation。
- 图片曲绘按需从公开曲绘仓库读取并缓存；生成图片不包含 SessionToken。
- 删除令牌不会自动删除该令牌对应的历史文件，以避免误删；卸载宿主应用会清除私有数据。

SessionToken 等同于账号凭据。不要截图、上传或发送给不受信任的人；如果令牌曾公开，应尽快在游戏/TapTap 侧使其失效并重新获取。

## 数据与设计参考

- [Catrong/phi-plugin](https://github.com/Catrong/phi-plugin)：TapTap/LeanCloud 流程、云存档格式、P3+B27 口径、信息图布局语言。
- [Catrong 的其他公开仓库](https://github.com/Catrong?tab=repositories)：曲绘资源、Koishi 端结构、静态模板与其他游戏插件的模块组织。
- [PhiHub](https://www.phib19.top/phigros/history)：历史总览与推分时间线信息层级。
- [Phigros Query](https://lilith.xtower.site)：RKS 明细字段与 Bn/图片工作流。
- [Kongyou 定数表](https://kyou.net.cn/songs)：按难度、定数段与标签/搜索组织曲库的交互方式。

本插件没有复制参考站点的品牌、账号系统或生成者署名。曲绘版权归原作者所有，仅用于个人成绩图生成与本地展示。

## 主要模块

```text
src/manifest.template.json  format v3、Capability、Dataset、主页组件和任务清单
src/web/app.js              多页 UI、迁移数据、同步、筛选、历史和 PNG 导出
src/web/login.js            TapTap 设备登录、MAC/HMAC 与 LeanCloud 换取令牌
src/web/save-parser.js      ZIP/AES 与 Phigros 二进制存档解析
src/web/rks.js              P3+B27、Bn 与推分 ACC
src/web/zip.js              有界 ZIP 校验、读取与 Dataset 输出
src/workers/phigros.js      主页摘要和后台云存档获取
src/test-js/                迁移、RKS、ZIP、存档、登录与 Worker 合同测试
```

## 构建与测试

本仓库是无需 Android SDK 和插件 SDK 的纯打包工程。Node.js 运行 Web 合同测试并锁定二维码依赖，Gradle 生成确定性 format v3 包：

```powershell
gradle testDebugUnitTest
gradle clean collectArtifacts
```

插件包输出：

```text
artifacts/phigros-advisor.atsplugin
```

## 发布通道

- 日常 CI 只测试与构建。手动推送 `debug-v<版本号>` 标签后，Debug 发布工作流重新验证并创建不可变预发布，再通知调试目录更新；不再创建滚动 `debug`。
- 推送 `v<versionName>` 标签后，工作流测试、构建并发布正式 Release。
- 两种发布都会生成带通道信息的元数据和校验和，并通过 GitHub App 短时令牌发送事件通知插件索引更新。
- `data-compatibility.json` 声明当前构建可能写入的数据格式及可读取范围；修改令牌、缓存或历史文件格式时必须同步递增并评估兼容范围，宿主据此决定是否允许历史版本降级。

插件声明最低 Android 8.0（API 26），因为主页组件和后台同步依赖 JavaScriptSandbox；宿主本身仍支持 API 24。二维码使用锁定的 `qrcode-generator 2.0.4`，MIT 许可证随包分发。

## 已知限制

- TapTap、LeanCloud 或云存档格式发生变化时，需要同步更新客户端与解析器。
- 首次使用必须联网下载曲库；之后可以使用本地缓存。
- 曲绘下载失败时，图片会使用难度色占位卡，不影响成绩计算。
- 插件不提供排行榜、云端账号或第三方 API 绑定，所有账号和历史管理均为本地实现。
