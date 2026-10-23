# dsh-sidebar-ingblock

给 DSH Web 侧栏加一个**独立的「进行中」分组**：从会话行的 `...` 菜单把会话加进来，固定在「工作区」上方，可折叠、可拖拽排序、跨重启保留。

[English](README.en.md)

## 功能

- **加入 / 移出**：任意会话行的 `...` 菜单里多一行「加入进行中 / 移出进行中」（位置在「置顶」与「重命名」之间）。
- **独立成组**：分组固定在「工作区」区头之上，滚动工作区列表时它不动；搜索、折叠工作区都不影响它。
- **可折叠**：点「进行中」标题或右侧箭头收起，只剩标题行 + 计数；状态持久化。
- **工作区可折叠**：「工作区」文字右侧多一个箭头，收起整个工作区列表（只留区头）；折叠状态下点搜索会自动展开。
- **拖拽换位**：拖动行到另一行的上半/下半即可插入，插入线视觉与 DSH 官方列表一致。
- **状态点**：等待中（琥珀）/ 运行中（蓝色呼吸）/ 完成未读（绿）/ 空闲（灰环）。
- **归档与清理**：归档会话灰显「已归档」且不可点开；被删除的会话自动从列表移除。
- **失败可见**：读写失败会回滚并在分组内显示红字，同时写控制台。

## 安装

三种方式，任选其一。

**本地目录**（开发用，改代码即时可见）

```sh
dsh plugin --profile <profile> add /path/to/dsh-sidebar-ingblock
```

**打包安装**（分发用）

```sh
npm pack
dsh plugin --profile <profile> add ./dsh-sidebar-ingblock-0.1.0.tgz
```

**Git 仓库**（pnpm 支持 git 规格；本机未验证）

```sh
dsh plugin --profile <profile> add 'git+https://<host>/<user>/dsh-sidebar-ingblock.git'
```

安装后**刷新页面**（Ctrl/Cmd+R）；改动了 Host 半（`index.js`）时要重启 DSH 或让 Plugin Manager 重新应用该行。

## 使用

1. 在任意会话行的 `...` 菜单点「加入进行中」；
2. 侧栏「工作区」上方出现「进行中 N」；
3. 点标题折叠/展开，拖动行调整顺序，行尾 `×` 移出；
4. 点「工作区」文字或右侧箭头可收起整个工作区列表。

## 数据与隐私

- 状态存在 `$DSH_HOME/plugin-data/dsh-sidebar-ingblock/state.json`（默认 `~/.dsh/...`），由 Host 半读写，**不经过浏览器存储**。
- 从旧包名 `dsh-sidebar-inprogress` 升级时，首次加载会把旧目录里的 `state.json` 搬到新目录，**列表不会丢**。
- 只保存 `sessionId + addedAt` 和两个折叠开关；标题、工作区名、运行状态都是实时从宿主读取的，不落盘。
- 不发起任何外网请求；Host 路由只接受同源、通过 `connection.requestRejection` 的请求。
- 删除该文件即可清空；损坏时会被改名成 `state.json.bad-<时间戳>` 并以空列表启动。

## 兼容性

- 在 **DSH 0.2.1-rc.2 / Desktop profile** 上实测通过（Windows）。
- 侧栏分组与折叠控件依赖官方 UI 的内部结构：`[data-slot="sidebar.workspaces"]`、`sectionHeader`、`sectionLabel`、`listArea` 这几处类名/属性。
- **失效表现是"降级"而不是崩溃**：官方改版后最坏情况是分组不出现或折叠箭头消失，侧栏本身和其他插件不受影响；控制台会打印 `[dsh-sidebar-ingblock] ...` 警告。
- 只支持 Web 端（`dsh.client.platform = web`）。

## 已知限制

- 拖拽只有鼠标操作，没有键盘重排。
- 新加入的会话总是排在最前，没有"按最近活动排序"选项。
- 单窗口内有效；不做多窗口同步，也不跨设备。
- 依赖官方 DOM，属于"柔性适配"，升级需要回归。

## 卸载

```sh
dsh plugin --profile <profile> remove dsh-sidebar-ingblock
```

插件卸载后菜单项与分组立即消失；状态文件保留（重装可恢复），需要彻底清理时删除 `~/.dsh/plugin-data/dsh-sidebar-ingblock/`。

## 开发

```
index.js            Host 半：状态文件、原子写、三个同源路由（state / toggle / ui）
client.js           Client 半：状态 store、菜单项、内联分组、工作区折叠、拖拽
cordis.patch.yml    bundle patch（插入一行 sidebar-inprogress）
locale/{zh,en}.json Plugin Manager 展示用的标题与描述
icon.svg            插件图标
tests/selfcheck.cjs 发布前自检（manifest / patch / 语法 / 端点 / 路径）
```

- 改 `client.js`：刷新页面即可。
- 改 `index.js`：重启 DSH，或在 Plugin Manager 里禁用再启用该行（会触发 profile 重算）。
- 自检：`npm test`。

## License

MIT
